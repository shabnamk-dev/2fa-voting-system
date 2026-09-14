import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

/**
 * Executes the WebAuthn registration ceremony in the browser.
 * @param {Object} options - PublicKeyCredentialCreationOptionsJSON returned from the backend.
 * @returns {Promise<RegistrationResponseJSON>}
 */
export async function performWebAuthnRegistration(options) {
  if (!options) {
    throw new Error("Missing WebAuthn registration options from server.");
  }
  return await startRegistration({ optionsJSON: options });
}

/**
 * Executes the WebAuthn authentication ceremony in the browser.
 * @param {Object} options - PublicKeyCredentialRequestOptionsJSON returned from the backend.
 * @returns {Promise<AuthenticationResponseJSON>}
 */
export async function performWebAuthnAuthentication(options) {
  if (!options) {
    throw new Error("Missing WebAuthn authentication options from server.");
  }
  return await startAuthentication({ optionsJSON: options });
}

export default {
  performWebAuthnRegistration,
  performWebAuthnAuthentication,
};
