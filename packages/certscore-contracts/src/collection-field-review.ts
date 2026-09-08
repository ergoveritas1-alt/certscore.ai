/** Inventory review metadata only: never a finding, legal conclusion or score. */
export const COLLECTION_FIELD_REVIEW_VERSION = 'collection-field-review.v1' as const;
export const FIELD_REVIEW_CATEGORIES = ['special_category','criminal_offence','government_identifier','financial_payment','credentials','personal_contact','identity_profile','location','marketing_contact','free_text','file_upload','operational','unknown'] as const;
export type FieldReviewCategory = typeof FIELD_REVIEW_CATEGORIES[number];
export const FIELD_REVIEW_POLICY: Record<FieldReviewCategory,{label:string;tier:'highest'|'high'|'personal'|'contextual'|'unknown'}> = {
 special_category:{label:'Special-category data',tier:'highest'},criminal_offence:{label:'Criminal / offence data',tier:'highest'},
 government_identifier:{label:'Government identifiers',tier:'high'},financial_payment:{label:'Financial / payment',tier:'high'},credentials:{label:'Credentials / security',tier:'high'},
 personal_contact:{label:'Personal contact',tier:'personal'},identity_profile:{label:'Identity / profile',tier:'personal'},location:{label:'Location',tier:'personal'},marketing_contact:{label:'Marketing contact',tier:'personal'},free_text:{label:'Unrestricted free text',tier:'personal'},file_upload:{label:'File upload — contents unknown',tier:'personal'},operational:{label:'Operational',tier:'contextual'},unknown:{label:'Not classified',tier:'unknown'},
};
export function classifyCollectionFieldReview(field:{label?:string;surfaceType?:string;inputType:string;autocompleteToken?:string;semanticCategory?:string;checkedState?:string;controlKind?:string}) {
 const text=`${field.label??''} ${field.autocompleteToken??''}`.toLowerCase();
 const marketing=/\b(newsletters?|marketing|promotional|mailing list|email updates)\b/.test(text);
 let category:FieldReviewCategory='unknown';
 if(/\b(health|medical|diagnosis|symptoms?|race|ethnicity|religion|religious|political|trade union|union membership|genetic|biometric|sexual orientation|sex life)\b/.test(text))category='special_category';
 else if(/\b(criminal|convictions?|arrests?|offen[cs]es?|criminal background)\b/.test(text))category='criminal_offence';
 else if(/\b(ssn|social security|national id|passport|driver'?s? licen[cs]e|tax id|taxpayer identification)\b/.test(text))category='government_identifier';
 else if(/\b(credit card|debit card|card number|bank account|routing number|iban|cvv|cvc)\b|cc-number|cc-csc|cc-exp/.test(text))category='financial_payment';
 else if(field.inputType==='password'||/\b(password|pin|security question|security answer)\b/.test(text))category='credentials';
 else if(field.inputType==='file')category='file_upload';
 else if(field.inputType==='textarea'||field.semanticCategory==='free_text'||/\b(tell us about yourself|comments?|case details|additional information)\b/.test(text))category='free_text';
 else if(['email','tel'].includes(field.inputType)||/\b(email|mobile|phone)\b/.test(text))category=marketing||field.surfaceType==='newsletter'?'marketing_contact':'personal_contact';
 else if(/\b(address|postcode|zip|postal code|latitude|longitude|geolocation)\b/.test(text))category='location';
 else if(/\b(company name|product|quantity|order number|booking reference)\b/.test(text))category='operational';
 else if(/\b(name|date of birth|dob|birthday|age|gender|job title|employer)\b/.test(text))category='identity_profile';
 else category=legacyCollectionFieldCategory(field.semanticCategory);
 const preselectedMarketing=marketing&&field.checkedState==='checked'&&['checkbox','switch'].includes(field.controlKind??'')&&!/\b(no|not|unsubscribe|opt out|don't|do not)\b/.test(text);
 return {version:COLLECTION_FIELD_REVIEW_VERSION,category,preselectedMarketing};
}
export function legacyCollectionFieldCategory(category?:string):FieldReviewCategory {
 return ({health:'special_category',password:'credentials',payment_card:'financial_payment',bank_account:'financial_payment',government_id:'government_identifier',social_security_number:'government_identifier',date_of_birth:'identity_profile',name:'identity_profile',email:'personal_contact',phone:'personal_contact',address:'location',geolocation:'location',file_upload:'file_upload',free_text:'free_text',search:'operational'} as Record<string,FieldReviewCategory>)[category??'']??'unknown';
}
