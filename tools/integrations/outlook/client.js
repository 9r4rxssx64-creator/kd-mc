// kdmc-outlook — Client Microsoft Graph (Outlook Calendar + Mail)
// Auteur : Kevin DESARZENS (U11804) — Casino de Monte-Carlo
//
// Variables d'environnement requises :
//   MS_CLIENT_ID       - Application (client) ID (Azure AD App Registration)
//   MS_CLIENT_SECRET   - Client secret (Certificates & secrets)
//   MS_TENANT_ID       - Directory (tenant) ID
//   MS_USER_ID         - UPN ou objectId de l'utilisateur SBM (ex: kevind@monaco.mc)
//                        -> requis en mode application (client_credentials)
//   MS_TIMEZONE        - optionnel, default "Romance Standard Time" (Monaco)
//
// Auth : OAuth2 Client Credentials (app-only). Pour user delegated, voir setup.md.
// Scope : https://graph.microsoft.com/.default (permissions Graph configurees cote Azure)

import "isomorphic-fetch";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

const TZ = process.env.MS_TIMEZONE || "Romance Standard Time"; // Monaco / Paris

// ---------- Auth ----------
function _getGraphClient() {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("[outlook] MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET manquants — voir setup.md");
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  return Client.initWithMiddleware({ authProvider });
}

function _userPath() {
  const userId = process.env.MS_USER_ID;
  if (!userId) {
    throw new Error("[outlook] MS_USER_ID manquant (UPN ou objectId requis en mode application)");
  }
  return `/users/${encodeURIComponent(userId)}`;
}

// ---------- Helpers ----------
function _toGraphDateTime(d) {
  if (!d) return null;
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  // Graph attend "yyyy-MM-ddTHH:mm:ss" (sans Z, avec timeZone à part)
  return iso.replace(/\.\d{3}Z$/, "");
}

// ---------- Public API — Calendar ----------

/**
 * Crée un événement sur le calendrier Outlook de l'utilisateur.
 * @param {string} summary - Titre
 * @param {Date|string} startTime
 * @param {Date|string} endTime
 * @param {string} [body] - Description (HTML ou texte)
 * @param {Array<string>} [attendees] - Emails
 * @returns {Promise<object>} Event Graph
 */
export async function createEvent(summary, startTime, endTime, body, attendees) {
  try {
    if (!summary || !startTime || !endTime) {
      throw new Error("summary, startTime, endTime requis");
    }
    const client = _getGraphClient();
    const event = {
      subject: summary,
      body: { contentType: "HTML", content: body || "" },
      start: { dateTime: _toGraphDateTime(startTime), timeZone: TZ },
      end: { dateTime: _toGraphDateTime(endTime), timeZone: TZ },
      attendees: (attendees || []).map(email => ({
        emailAddress: { address: email },
        type: "required",
      })),
    };
    return await client.api(`${_userPath()}/events`).post(event);
  } catch (e) {
    throw new Error(`[outlook.createEvent] ${e.message}`);
  }
}

/**
 * Liste les événements des N prochains jours.
 * @param {number} [days=7]
 * @returns {Promise<Array<object>>}
 */
export async function listEvents(days = 7) {
  try {
    const client = _getGraphClient();
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + days);

    const res = await client
      .api(`${_userPath()}/calendarView`)
      .query({
        startDateTime: now.toISOString(),
        endDateTime: end.toISOString(),
      })
      .header("Prefer", `outlook.timezone="${TZ}"`)
      .orderby("start/dateTime")
      .top(250)
      .get();

    return res.value || [];
  } catch (e) {
    throw new Error(`[outlook.listEvents] ${e.message}`);
  }
}

// ---------- Public API — Mail ----------

/**
 * Envoie un mail via l'utilisateur configuré.
 * @param {string|Array<string>} to - destinataire(s)
 * @param {string} subject
 * @param {string} body - HTML ou texte
 * @returns {Promise<{sent:true, to:Array<string>}>}
 */
export async function sendMail(to, subject, body) {
  try {
    if (!to || !subject) throw new Error("to et subject requis");
    const recipients = (Array.isArray(to) ? to : [to]).map(address => ({
      emailAddress: { address },
    }));

    const client = _getGraphClient();
    const message = {
      message: {
        subject,
        body: { contentType: "HTML", content: body || "" },
        toRecipients: recipients,
      },
      saveToSentItems: true,
    };
    await client.api(`${_userPath()}/sendMail`).post(message);
    return { sent: true, to: recipients.map(r => r.emailAddress.address) };
  } catch (e) {
    throw new Error(`[outlook.sendMail] ${e.message}`);
  }
}

export default { createEvent, listEvents, sendMail };
