/** Fictional, compact source-association regression. No copied policy text. */
export const publisherPolicyText = [
  "Sketchgarden Privacy Policy. Sketchgarden is an open source drawing project and the data controller for this website.",
  "Our desktop application runs locally and does not send drawing content or usage records to us.",
  "On our website we process contact details and identifiers to answer support requests and keep the service working.",
  "We retain support records for six months. Our legal basis for this processing is our legitimate interest in providing support.",
  "California residents have the right to know what personal information we collect, the right to delete personal information, and the right to correct inaccurate personal information.",
  "We will not discriminate against you for exercising your privacy rights. Contact privacy@sketchgarden.example to exercise your rights.",
  "We do not sell or share personal information. We use a service provider for aggregate website statistics; its separate privacy policy explains its services.",
].join(" ");
export const vendorPolicyText = [
  "Metricpond Privacy Policy. Metricpond is the data controller for its analytics subscription service.",
  "We process account contact details and invoice records to provide services. We retain records for six years to meet legal obligations.",
  "You have the right to know what personal information we collect, the right to delete personal information, and the right to correct inaccurate personal information.",
  "Contact privacy@metricpond.example to exercise your privacy rights. We do not sell or share personal information.",
].join(" ").repeat(8);
export const publisherPolicyHtml = (providerUrl: string) => `<html lang="en"><title>Sketchgarden Privacy Policy</title><body><main><h1>Privacy Policy</h1><p>${publisherPolicyText}</p><a href="${providerUrl}">Metricpond Privacy Policy</a><a href="/downloads">Download the application</a></main></body></html>`;
export const vendorPolicyHtml = `<html lang="en"><title>Metricpond Privacy Policy</title><body><main><h1>Metricpond account privacy</h1><p>${vendorPolicyText}</p></main></body></html>`;
