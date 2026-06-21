// ─────────────────────────────────────────────────────────────────
//  Airtable helpers
// ─────────────────────────────────────────────────────────────────

const BASE_URL = (typeof AIRTABLE_BASE_ID !== "undefined" && typeof AIRTABLE_TABLE !== "undefined")
  ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`
  : null;

const headers = () => ({
  "Authorization": `Bearer ${typeof AIRTABLE_TOKEN !== "undefined" ? AIRTABLE_TOKEN : ""}`,
  "Content-Type": "application/json",
});

/** Create a new RSVP record */
async function createRSVP(fields) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  return res.json();
}

/** Find an existing RSVP by name + email. Returns the record or null. */
async function findRSVP(name, email) {
  const formula = `AND(LOWER({Name})="${name.toLowerCase().trim()}",LOWER({Email})="${email.toLowerCase().trim()}")`;
  const url = `${BASE_URL}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  const data = await res.json();
  return data.records?.[0] ?? null;
}

/** Update the Status field on an existing record */
async function updateStatus(recordId, status) {
  const res = await fetch(`${BASE_URL}/${recordId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields: { Status: status } }),
  });
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
//  UI helpers
// ─────────────────────────────────────────────────────────────────

function setStatus(el, message, type) {
  el.textContent = message;
  el.className = `form-status ${type}`;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait…" : btn.dataset.label;
}

// ─────────────────────────────────────────────────────────────────
//  RSVP form
// ─────────────────────────────────────────────────────────────────

const rsvpForm    = document.getElementById("rsvp-form");
const rsvpStatus  = document.getElementById("rsvp-status");
const rsvpSubmit  = document.getElementById("rsvp-submit");
rsvpSubmit.dataset.label = rsvpSubmit.textContent;

// Show/hide +1 name field based on radio selection
document.querySelectorAll('input[name="plus-one"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const nameField = document.getElementById("plusone-name-field");
    nameField.style.display = radio.value === "yes" ? "flex" : "none";
    if (radio.value !== "yes") document.getElementById("rsvp-plusone-name").value = "";
  });
});

rsvpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus(rsvpStatus, "", "");

  const name       = document.getElementById("rsvp-name").value.trim();
  const email      = document.getElementById("rsvp-email").value.trim();
  const plusOne    = document.querySelector('input[name="plus-one"]:checked')?.value ?? null;
  const plusOneName = document.getElementById("rsvp-plusone-name").value.trim();
  const dietary    = document.getElementById("rsvp-dietary").value.trim();
  const message    = document.getElementById("rsvp-message").value.trim();

  if (!name || !email || !plusOne) {
    setStatus(rsvpStatus, "Please fill in all required fields.", "error");
    return;
  }

  setLoading(rsvpSubmit, true);

  try {
    // Check for a duplicate (same name + email)
    const existing = await findRSVP(name, email);
    if (existing && existing.fields.Status !== "Cancelled") {
      setStatus(rsvpStatus, "It looks like you've already RSVPed! If you need to make changes, please email us.", "error");
      return;
    }

    // If they previously cancelled, update the existing record instead
    if (existing && existing.fields.Status === "Cancelled") {
      await updateStatus(existing.id, "Confirmed");
    } else {
      await createRSVP({
        Name:                   name,
        Email:                  email,
        "Plus One":             plusOne === "yes" ? "Yes" : "No",
        "Plus One Name":        plusOneName,
        "Dietary Restrictions": dietary,
        Message:                message,
        Status:                 "Confirmed",
      });
    }

    setStatus(rsvpStatus, "🎉 You're on the list! We can't wait to celebrate with you.", "success");
    rsvpForm.reset();
  } catch (err) {
    console.error(err);
    setStatus(rsvpStatus, "Something went wrong. Please try again or email us directly.", "error");
  } finally {
    setLoading(rsvpSubmit, false);
  }
});

// ─────────────────────────────────────────────────────────────────
//  Cancel form
// ─────────────────────────────────────────────────────────────────

const cancelForm   = document.getElementById("cancel-form");
const cancelStatus = document.getElementById("cancel-status");
const cancelSubmit = document.getElementById("cancel-submit");
cancelSubmit.dataset.label = cancelSubmit.textContent;

cancelForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus(cancelStatus, "", "");

  const name  = document.getElementById("cancel-name").value.trim();
  const email = document.getElementById("cancel-email").value.trim();

  if (!name || !email) {
    setStatus(cancelStatus, "Please enter both your name and email.", "error");
    return;
  }

  setLoading(cancelSubmit, true);

  try {
    const record = await findRSVP(name, email);

    if (!record) {
      setStatus(cancelStatus, "We couldn't find an RSVP with that name and email. Double-check the details.", "error");
      return;
    }

    if (record.fields.Status === "Cancelled") {
      setStatus(cancelStatus, "Your RSVP is already cancelled.", "error");
      return;
    }

    await updateStatus(record.id, "Cancelled");
    setStatus(cancelStatus, "Your RSVP has been cancelled. We'll miss you!", "success");
    cancelForm.reset();
  } catch (err) {
    console.error(err);
    setStatus(cancelStatus, "Something went wrong. Please try again or email us directly.", "error");
  } finally {
    setLoading(cancelSubmit, false);
  }
});
