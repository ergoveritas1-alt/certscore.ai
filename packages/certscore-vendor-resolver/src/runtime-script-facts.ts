import {parse} from "acorn";
import {createHash} from "node:crypto";
import {runtimeScriptEvidenceSchema,type RuntimeScriptEvidence} from "@certscore/contracts";
type Node={type:string;start:number;end:number;[key:string]:any};
const member=(n:Node|undefined,object:string,property:string)=>n?.type === "MemberExpression"&&!n.computed&&n.object?.type === "Identifier"&&n.object.name === object&&n.property?.name === property;
const functionNode=(n:Node)=>["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"].includes(n.type);
const children=(n:Node):Node[]=>Object.values(n).flatMap(value=>Array.isArray(value)?value.filter(v=>v&&typeof v.type === "string"):value&&typeof value === "object"&&typeof value.type === "string"?[value]:[]);
function nodes(root:Node,skipFunctions=false){const result:Node[]=[];const pending=[root];while(pending.length&&result.length<180_000){const n=pending.pop()!;result.push(n);if(!skipFunctions||n===root||!functionNode(n))pending.push(...children(n));}return result;}
const digest=(source:string)=>createHash("sha256").update(source).digest("hex");
/** Reviewed structural recipes: no script execution, identifier-name purpose guess, or arbitrary regex classification. */
export function extractRuntimeScriptFacts(source:string,input:Omit<RuntimeScriptEvidence,"contractVersion"|"facts"|"sourceSha256"|"sourceBytes">):RuntimeScriptEvidence|undefined {
  const bytes=Buffer.byteLength(source);if(!bytes||bytes>1_048_576)return;
  let root:Node;try{root=parse(source,{ecmaVersion:"latest",sourceType:"module"}) as Node;}catch{return;}
  const all=nodes(root);if(all.length>=180_000)return;
  const calls=all.filter(n=>n.type === "CallExpression");
  const callsByName=new Map<string,Node[]>(),declarationsByName=new Map<string,Node[]>(),mutatedNames=new Set<string>();
  for(const n of all){
    if(n.type === "CallExpression"&&n.callee?.type === "Identifier")callsByName.set(n.callee.name,[...(callsByName.get(n.callee.name)??[]),n]);
    if(n.type === "VariableDeclarator"&&n.id?.type === "Identifier")declarationsByName.set(n.id.name,[...(declarationsByName.get(n.id.name)??[]),n]);
    if(n.type === "AssignmentExpression"&&n.left?.type === "Identifier")mutatedNames.add(n.left.name);
    if(n.type === "UpdateExpression"&&n.argument?.type === "Identifier")mutatedNames.add(n.argument.name);
  }
  const facts:RuntimeScriptEvidence["facts"]=[];
  const add=(n:Node,fact:Omit<RuntimeScriptEvidence["facts"][number],"start"|"end"|"expressionSha256"|"excerpts">,context:Node[]=[])=>{
    const excerpt=(node:Node)=>{
      if(node.end-node.start>240||nodes(node).some(part=>part.type === "TemplateLiteral"||part.type === "Literal"&&typeof part.value === "string"&&!["","=","; path=/","checked","y","n",fact.name].includes(part.value)))return;
      return {start:node.start,end:node.end,text:source.slice(node.start,node.end)};
    };
    const primary=excerpt(n);if(!primary||facts.length>=8)return;
    facts.push({...fact,start:n.start,end:n.end,expressionSha256:digest(primary.text),excerpts:[primary,...context.map(excerpt).filter((row):row is NonNullable<typeof row>=>Boolean(row))].slice(0,3)});
  };
  // Resolve only one unmodified lexical initializer in the nearest block. Shadowing,
  // repeated assignments and ambiguous bindings fail closed.
  const parent=new Map<Node,Node>();for(const n of all)for(const c of children(n))parent.set(c,n);
  const scopeOf=(n:Node)=>{let p=parent.get(n);while(p&&p.type!=="BlockStatement"&&p.type!=="Program")p=parent.get(p);return p??root;};
  const initializer=(id:Node,at:Node):Node|undefined=>{
    if(id?.type!=="Identifier")return id;
    const scope=scopeOf(at),rows=nodes(scope,true);
    const declarations=rows.filter(n=>n.type === "VariableDeclarator"&&n.id?.name===id.name);
    if(declarations.length!==1||declarations[0]!.start>=at.start||!declarations[0]!.init||rows.some(n=>n.type === "AssignmentExpression"&&n.left?.type === "Identifier"&&n.left.name===id.name||n.type === "UpdateExpression"&&n.argument?.name===id.name))return;
    return declarations[0]!.init;
  };
  const referrer=(n:Node|undefined):boolean=>Boolean(n&&(member(n,"document","referrer")||n.type === "CallExpression"&&n.callee?.type === "MemberExpression"&&!n.callee.computed&&["replace","slice","substring"].includes(n.callee.property?.name)&&referrer(n.callee.object)));
  for(const n of all){
    if(n.type!=="CallExpression"||n.arguments?.length!==2)continue;
    for(const type of ["localStorage","sessionStorage"] as const)if(member(n.callee,type,"setItem")&&n.arguments[0]?.type === "Literal"&&typeof n.arguments[0].value === "string"&&n.arguments[0].value.length<=160){
      const key=n.arguments[0].value;
      const writes=calls.filter(other=>member(other.callee,type,"setItem")&&other.arguments[0]?.value === key);
      if(writes.length === 1&&referrer(initializer(n.arguments[1],n)))add(n,{kind:"storage_referrer_flow",name:key,storageType:type},[initializer(n.arguments[1],n)!]);
    }
  }
  // A cookie helper must actually write its first two parameters to document.cookie.
  // Merely naming a function setCookie is insufficient.
  for(const fn of all.filter(functionNode)){
    const params=fn.params;if(fn.type!=="FunctionDeclaration"||!fn.id?.name||params.length<2||params[0]?.type!=="Identifier"||params[1]?.type!=="Identifier")continue;
    const assignments=nodes(fn.body,true).filter(n=>n.type === "AssignmentExpression"&&n.operator === "="&&member(n.left,"document","cookie"));
    if(assignments.length!==1)continue;
    const expr=assignments[0]!.right;
    // Require a name= prefix and explicit URI encoding of the value.
    const leaves=nodes(expr,true);
    if(expr.type === "BinaryExpression"&&leaves.some(n=>n.type === "BinaryExpression"&&n.operator === "+"&&n.left?.name===params[0].name&&n.right?.value === "=")&&
      leaves.some(n=>n.type === "CallExpression"&&n.callee?.name === "encodeURIComponent"&&n.arguments?.length === 1&&n.arguments[0]?.name === params[1].name))
      add(assignments[0]!,{kind:"cookie_parameter_setter",name:fn.id.name,helper:fn.id.name});
  }
  // A checkbox preference flow is structural context, not proof of registration:
  // checked-state callers -> function parameters -> encoded preference accumulator -> cookie helper.
  for(const declaration of all.filter(n=>n.type === "VariableDeclarator"&&n.id?.type === "Identifier"&&n.init&&functionNode(n.init))){
    const fn=declaration.init as Node,params=fn.params;
    if(!params.length||params.some((p:Node)=>p.type!=="Identifier"))continue;
    const callers=callsByName.get(declaration.id.name)??[];
    const checked=(n:Node)=>nodes(n).some(row=>row.type === "CallExpression"&&row.callee?.type === "MemberExpression"&&row.callee.property?.name === "prop"&&row.arguments?.[0]?.value === "checked");
    if(!callers.length||!callers.every(n=>n.arguments.length===params.length&&n.arguments.every((arg:Node)=>arg.type === "ConditionalExpression"&&checked(arg.test))))continue;
    const body=nodes(fn.body,true);
    for(const call of body.filter(n=>n.type === "CallExpression"&&n.callee?.type === "Identifier"&&n.arguments.length>=2)){
      const nameExpr=call.arguments[0];let name=typeof nameExpr?.value === "string"?nameExpr.value:undefined;
      if(!name&&nameExpr?.type === "Identifier"){
        const declarations=(declarationsByName.get(nameExpr.name)??[]).filter(n=>typeof n.init?.value === "string");
        if(declarations.length===1&&!mutatedNames.has(nameExpr.name))name=declarations[0]!.init.value;
      }
      const value=call.arguments[1];if(!name||name.length>160||value?.type!=="Identifier")continue;
      const mutations=body.filter(n=>n.type === "AssignmentExpression"&&n.left?.name===value.name);
      if(mutations.length===params.length&&mutations.every(n=>n.operator === "+="&&n.right?.type === "ConditionalExpression"&&n.right.test?.type === "BinaryExpression"&&params.some((p:Node)=>p.name===n.right.test.left?.name)&&["Literal"].includes(n.right.consequent?.type)&&n.right.alternate?.type === "Literal"))
        add(call,{kind:"checkbox_preference_cookie_call",name,helper:call.callee.name},[callers[0]!]);
    }
  }
  const knownKeys=new Set(facts.filter(fact=>fact.kind === "storage_referrer_flow").map(fact=>fact.name));
  const readCalls=calls.filter(call=>member(call.callee,"localStorage","getItem")||member(call.callee,"sessionStorage","getItem"));
  const priority=(call:Node)=>knownKeys.has(call.arguments[0]?.value)?0:call.arguments[0]?.type === "CallExpression"?1:2;
  readCalls.sort((a,b)=>priority(a)-priority(b)||a.start-b.start);
  for(const call of readCalls){
    if(call.arguments.length!==1)continue;
    const storageType=member(call.callee,"localStorage","getItem")?"localStorage":"sessionStorage";
    const literal=call.arguments[0]?.type === "Literal"&&typeof call.arguments[0].value === "string"&&call.arguments[0].value.length<=160;
    const enumerated=call.arguments[0]?.type === "CallExpression"&&member(call.arguments[0].callee,storageType,"key")&&call.arguments[0].arguments.length===1;
    if(!literal&&!enumerated)continue;
    let ancestor=parent.get(call),statement:Node|undefined,network:Node|undefined;
    while(ancestor&&!functionNode(ancestor)){
      if(ancestor.type === "CallExpression"&&(ancestor.callee?.type === "Identifier"&&ancestor.callee.name === "fetch"||member(ancestor.callee,"navigator","sendBeacon")))network=ancestor;
      if(ancestor.type === "ExpressionStatement"||ancestor.type === "IfStatement"){statement=ancestor;break;}
      ancestor=parent.get(ancestor);
    }
    const cleanup=statement&&nodes(statement,true).find(node=>node.type === "CallExpression"&&(member(node.callee,storageType,"removeItem")||member(node.callee,storageType,"clear")));
    const comparison=parent.get(call)?.type === "BinaryExpression"&&["===","!==","==","!="].includes(parent.get(call)!.operator);
    const position=(offset:number)=>{const prefix=source.slice(0,offset);return {line:1+(prefix.match(/\n/g)?.length??0),column:offset-prefix.lastIndexOf("\n")};};
    const start=position(call.start),end=position(call.end);
    add(call,{kind:"storage_read_context",name:literal?call.arguments[0].value:"[enumerated key]",storageType,...(enumerated?{keySource:"enumerated_storage_key" as const}:{}),useContext:enumerated?"storage_enumeration":cleanup&&comparison?"storage_cleanup_check":network?"network_argument":"unresolved",callsite:{...start,endLine:end.line,endColumn:end.column}},cleanup?[cleanup]:[]);
  }
  if(!facts.length)return;
  return runtimeScriptEvidenceSchema.parse({...input,contractVersion:"certscore.runtime-script-evidence.v1",sourceBytes:bytes,sourceSha256:digest(source),facts});
}

/** Declared purpose only: never verifies the claimed necessity or actual use. */
export function classifyDeclaredCookiePurpose(description:string):"functional"|"preferences"|"unknown" {
  const clauses=description.split(/[.!?]+/).filter(clause=>! /\b(?:do not|does not|never|not used|cannot)\b/i.test(clause));
  if(clauses.some(clause=>/\b(?:store\w*|remember\w*|sav\w*)\b.{0,90}\b(?:consent|preferences?|choices?|settings?)\b/i.test(clause)))return "preferences";
  if(clauses.some(clause=>/\b(?:deliver\w*|enabl\w*|provid\w*|functional purposes?)\b.{0,100}\b(?:services?|features?|functions?|website)\b/i.test(clause)))return "functional";
  return "unknown";
}
