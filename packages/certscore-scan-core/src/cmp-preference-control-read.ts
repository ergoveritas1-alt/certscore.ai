import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

export const readPreferenceControlsInDocument = (nodes: Element[], recipe?: KnownCmpDefinition["preferenceCategoryInventory"]) => ({
      overflow: nodes.length > 100,
      controls: nodes.slice(0, 100).map(node => {
        const input = node as HTMLInputElement;
        const box = node.getBoundingClientRect();
        const root = node.getRootNode() as Document | ShadowRoot;
        const labelledBy = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean).map(id => root.getElementById(id)?.textContent ?? "").join(" ");
        const label = (node.getAttribute("aria-label") ?? (labelledBy || (input.labels?.length ? [...input.labels].map(label => label.textContent).join(" ") : ""))).trim().slice(0, 240);
        // Styled checkboxes often hide the input and expose its associated
        // label. Require an exact native label/control association, visible
        // viewport geometry and a real hit target; hidden panels stay excluded.
        const labelledTargetVisible = node instanceof HTMLInputElement && [...(node.labels ?? [])].some(label => {
          if (label.control !== node) return false;
          const rect = label.getBoundingClientRect(), style = getComputedStyle(label);
          if (rect.width <= 0 || rect.height <= 0 || style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) return false;
          const x = Math.max(0, rect.left) + Math.min(rect.width, innerWidth - Math.max(0, rect.left)) / 2;
          const y = Math.max(0, rect.top) + Math.min(rect.height, innerHeight - Math.max(0, rect.top)) / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
          let hit = document.elementFromPoint(x, y);
          for (let depth = 0; hit?.shadowRoot && depth < 8; depth++) {
            const inner = hit.shadowRoot.elementFromPoint(x, y);
            if (!inner || inner === hit) break;
            hit = inner;
          }
          return Boolean(hit && (hit === label || label.contains(hit)));
        });
        const group = node.closest("fieldset, [role=group]");
        const groupLabel = group?.getAttribute("aria-label") ?? group?.querySelector("legend")?.textContent ?? "";
        // A named-CMP structural association is stronger than guessing from
        // labels such as "Enable Others". Require one category title and one
        // switch within the same category and verified dialog scope.
        const dialog = recipe ? node.closest(recipe.dialogSelector) : null;
        const category = recipe ? node.closest(recipe.categorySelector) : null;
        const titles = category && recipe ? category.querySelectorAll(recipe.titleSelector) : [];
        const toggles = category && recipe ? category.querySelectorAll(recipe.toggleSelector) : [];
        const radio = Boolean(recipe?.radioGroupSelector && node.matches(recipe.radioGroupSelector));
        const choices = radio ? [...node.querySelectorAll('[role="radio"]')] : [];
        const radioVisible = !radio || choices.every(choice => {
          const box = choice.getBoundingClientRect();
          if (box.width <= 0 || box.height <= 0) return false;
          let ancestor: Element | null = choice;
          for (let depth = 0; ancestor && depth < 64; depth++) {
            const style = getComputedStyle(ancestor);
            if (style.display === "none" || style.visibility !== "visible" || style.opacity === "0" ||
                ancestor.matches('[hidden], [aria-hidden="true" i], [inert]')) return false;
            const tree = ancestor.getRootNode();
            ancestor = ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
          }
          return !ancestor;
        });
        const radioValid = !radio || radioVisible && choices.length === 2 &&
          choices.every(choice => ["true", "false"].includes(choice.getAttribute("aria-checked") ?? "")) &&
          choices.filter(choice => choice.getAttribute("aria-checked") === "true").length <= 1;
        const registeredControl = Boolean(radioValid && recipe && dialog && category && dialog.contains(category) &&
          node.matches(recipe.toggleSelector) && titles.length === 1 && titles[0]!.textContent?.trim() &&
          titles[0]!.getBoundingClientRect().width > 0 && getComputedStyle(titles[0]!).visibility === "visible" &&
          toggles.length === 1 && toggles[0] === node);
        const serviceLinks = category && recipe?.serviceLinkSelector ? category.querySelectorAll(recipe.serviceLinkSelector) : [];
        const registeredService = Boolean(registeredControl && recipe?.kind === "service" && serviceLinks.length === 1 &&
          serviceLinks[0]!.getAttribute("aria-label") === titles[0]!.textContent!.trim() + recipe.serviceLinkLabelSuffix &&
          /^https?:/.test((serviceLinks[0] as HTMLAnchorElement).href));
        const registeredCategory = registeredControl && recipe?.kind !== "service";
        // Some reviewed CMP switches expose a styled sibling instead of a
        // native label. Bind its unique original input and explicit heading;
        // neither aria-labelledby alone nor offscreen/covered proxies suffice.
        const proxy = registeredControl && recipe?.visibleProxySelector ? node.nextElementSibling : null;
        const proxyVisible = proxy?.matches(recipe!.visibleProxySelector!) && node instanceof HTMLInputElement &&
          !node.matches('[hidden], [aria-hidden="true"], [inert]') &&
          node.getAttribute("aria-labelledby") === titles[0]!.id && titles[0]!.id.length > 0 &&
          node.parentElement?.querySelectorAll(recipe!.toggleSelector).length === 1 && (() => {
            const rect = proxy.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            // aria-hidden on the decorative sibling is intentional. The
            // input, category and containing panel must remain accessible.
            for (let ancestor: Element | null = proxy; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 ||
                  ancestor.hasAttribute("hidden") || ancestor.hasAttribute("inert") ||
                  ancestor !== proxy && ancestor.getAttribute("aria-hidden") === "true") return false;
            }
            const left = Math.max(0,rect.left), top = Math.max(0,rect.top);
            const right = Math.min(innerWidth,rect.right), bottom = Math.min(innerHeight,rect.bottom);
            if (right <= left || bottom <= top) return false;
            const hit = document.elementFromPoint((left+right)/2,(top+bottom)/2);
            return Boolean(hit && (hit === node || hit === proxy || proxy.contains(hit)));
          })();
        const style = getComputedStyle(node);
        return { registeredCategory, registeredService, label: registeredService ? titles[0]!.textContent!.trim().slice(0, 240) : label || (registeredCategory ? titles[0]!.textContent!.trim().slice(0, 240) : ""), groupLabel: groupLabel.trim().slice(0, 160), visible: radioVisible && (Boolean(proxyVisible) || labelledTargetVisible || box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0),
          enabled: radio ? radioValid && choices.some(choice => !choice.matches(':disabled, [aria-disabled="true"]')) : !node.matches(":disabled") && node.getAttribute("aria-disabled") !== "true", checked: radio ? null : node instanceof HTMLInputElement ? input.checked : node.getAttribute("aria-checked") === "true" };
      }),
    });

