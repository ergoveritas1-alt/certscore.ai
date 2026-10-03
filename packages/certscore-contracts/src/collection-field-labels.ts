import type { CollectionSurfaceSemanticCategory } from './index';

/** Exact public field labels only. No entered values, translation calls, or substring inference. */
export function normalizeCollectionFieldLabel(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim().replace(/[\s*:]+$/u, '');
}

const LABELS: Partial<Record<CollectionSurfaceSemanticCategory, readonly string[]>> = {
  name: ['name', 'full name', 'first name', 'last name', 'given name', 'surname', 'vorname', 'nachname', 'familienname', 'vor- und nachname', 'vor und nachname', 'vor- & nachname', 'prénom', 'nom', 'nom de famille', 'nombre', 'apellidos', 'nombre completo', 'nome', 'cognome', 'nome completo', 'sobrenome', 'apelido', 'voornaam', 'achternaam', 'naam'],
  email: ['email', 'e-mail', 'email address', 'e-mail address', 'e-mail-adresse', 'emailadresse', 'courriel', 'adresse e-mail', 'adresse électronique', 'correo electrónico', 'correo electronico', 'posta elettronica', 'indirizzo email', 'correio eletrónico', 'correio eletrônico', 'endereço de e-mail', 'e-mailadres', 'emailadres'],
  phone: ['phone', 'phone number', 'telephone', 'telephone number', 'mobile', 'mobile number', 'telefon', 'telefonnummer', 'mobiltelefonnummer', 'mobilnummer', 'handynummer', 'handy', 'firma telefonnummer', 'privat telefonnummer', 'geschäftlich telefonnummer', 'téléphone', 'numéro de téléphone', 'teléfono', 'telefono', 'número de teléfono', 'numero di telefono', 'cellulare', 'telefone', 'telemóvel', 'celular', 'número de telefone', 'telefoon', 'telefoonnummer', 'mobiel nummer'],
  address: ['address', 'street address', 'postal address', 'postal code', 'postcode', 'zip', 'zip code', 'city', 'country', 'straße', 'straße/nr.', 'straße/nr', 'strasse', 'strasse/nr.', 'strasse/nr', 'hausnummer', 'postleitzahl', 'plz', 'ort', 'wohnort', 'anschrift', 'adresse', 'adresse postale', 'code postal', 'ville', 'pays', 'dirección', 'dirección postal', 'código postal', 'codigo postal', 'ciudad', 'país', 'indirizzo', 'indirizzo postale', 'codice postale', 'città', 'paese', 'endereço', 'morada', 'cep', 'cidade', 'adres', 'straat', 'huisnummer', 'woonplaats', 'land'],
  unknown: ['username', 'user name', 'company name', 'file name', 'filename', 'company', 'organization', 'organisation', 'job title', 'firmenname', 'dateiname', 'nom de société', 'nom de fichier', 'nombre de empresa', 'nombre de archivo', 'nome azienda', 'nome del file', 'nome da empresa', 'nome do arquivo', 'bedrijfsnaam', 'bestandsnaam'],
};
const LABEL_LOOKUP = new Map(Object.entries(LABELS).flatMap(([category, labels]) => labels!.map(label => [normalizeCollectionFieldLabel(label), category as CollectionSurfaceSemanticCategory] as const)));
export function collectionFieldLabelCategory(label?: string) {
  return label ? LABEL_LOOKUP.get(normalizeCollectionFieldLabel(label)) : undefined;
}

const AUTOCOMPLETE: Record<string, CollectionSurfaceSemanticCategory> = {
  name: 'name', 'given-name': 'name', 'additional-name': 'name', 'family-name': 'name', 'honorific-prefix': 'name', 'honorific-suffix': 'name',
  email: 'email', tel: 'phone', 'tel-country-code': 'phone', 'tel-national': 'phone', 'tel-area-code': 'phone', 'tel-local': 'phone', 'tel-local-prefix': 'phone', 'tel-local-suffix': 'phone', 'tel-extension': 'phone',
  'street-address': 'address', 'address-line1': 'address', 'address-line2': 'address', 'address-line3': 'address', 'address-level1': 'address', 'address-level2': 'address', 'address-level3': 'address', 'address-level4': 'address', country: 'address', 'country-name': 'address', 'postal-code': 'address',
  'current-password': 'password', 'new-password': 'password', 'cc-name': 'payment_card', 'cc-given-name': 'payment_card', 'cc-additional-name': 'payment_card', 'cc-family-name': 'payment_card', 'cc-number': 'payment_card', 'cc-exp': 'payment_card', 'cc-exp-month': 'payment_card', 'cc-exp-year': 'payment_card', 'cc-csc': 'payment_card', 'cc-type': 'payment_card',
  bday: 'date_of_birth', 'bday-day': 'date_of_birth', 'bday-month': 'date_of_birth', 'bday-year': 'date_of_birth', url: 'website_url',
  username: 'unknown', organization: 'unknown', 'organization-title': 'unknown', 'one-time-code': 'unknown',
};
export function collectionFieldAutocompleteCategory(value?: string) {
  const tokens = value?.toLowerCase().trim().split(/\s+/u) ?? [];
  if (tokens[0]?.startsWith('section-') && tokens[0].length > 8) tokens.shift();
  if (['shipping', 'billing'].includes(tokens[0] ?? '')) tokens.shift();
  if (['home', 'work', 'mobile', 'fax', 'pager'].includes(tokens[0] ?? '')) {
    tokens.shift();
    if (!/^(?:tel(?:-|$)|email$)/u.test(tokens[0] ?? '')) return undefined;
  }
  if (tokens.at(-1) === 'webauthn') tokens.pop();
  return tokens.length === 1 ? AUTOCOMPLETE[tokens[0]!] : undefined;
}

/** A selected checkbox alone is not an affirmative marketing choice. */
export function isPositiveCollectionMarketingChoice(label?: string) {
  const text = normalizeCollectionFieldLabel(label ?? '').replace(/[’‘]/gu, "'");
  if (/\b(?:no|not|never|don't|do not|unsubscribe|opt out|kein\w*|nicht|ne|pas|jamais|sans|non|nessun\w*|nunca|sin|não|nao|sem|geen|niet|uitschrijven)\b/u.test(text)) return false;
  return /^(?:send me (?:the |your )?(?:newsletters?|marketing emails?|promotional emails?|email updates)|subscribe (?:me )?to (?:the |your )?newsletter|i (?:agree|consent|want|would like) to receive (?:the |your )?(?:newsletters?|marketing emails?|promotional emails?|email updates)|(?:ja[, ]+)?ich möchte (?:den |einen |ihren )?newsletter (?:erhalten|abonnieren)|(?:j'accepte|je souhaite) de recevoir (?:la newsletter|des offres commerciales)|je souhaite recevoir (?:la newsletter|des offres commerciales)|(?:sí[, ]+)?(?:quiero|deseo|acepto) recibir (?:el boletín|la newsletter|el newsletter|ofertas comerciales)|(?:desidero|acconsento a) ricevere (?:la newsletter|offerte commerciali)|(?:quero|desejo|aceito) receber (?:a newsletter|ofertas comerciais)|ik wil (?:de nieuwsbrief|commerciële aanbiedingen) ontvangen)(?:[\s.!,:;]|$)/u.test(text);
}
