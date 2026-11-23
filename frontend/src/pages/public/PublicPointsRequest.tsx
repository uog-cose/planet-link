import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, csrfCookie, getCsrf } from "../../api";
import { Button, Card } from "../../components/ui";
import { CheckCircle2, MessageSquare, Star, UserRound } from "lucide-react";

export function PublicPointsRequest() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    organisation: "",
    comment: "",
    rating: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) {
      setError("This public points QR is missing or invalid.");
      setLoading(false);
      return;
    }
    api<any>(`/public/points-info/?token=${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "This QR is no longer active.",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);
  const orgWords = useMemo(
    () =>
      form.organisation.trim()
        ? form.organisation.trim().split(/\s+/).filter(Boolean).length
        : 0,
    [form.organisation],
  );
  const nameLetters = useMemo(
    () => Array.from(form.name).filter((ch) => /\p{L}/u.test(ch)).length,
    [form.name],
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (nameLetters < 3) {
      setError("Please enter a name containing at least 3 letters.");
      return;
    }
    if (orgWords > 50) {
      setError("Organisation must be 50 words or fewer.");
      return;
    }
    if (!/^[1-5]$/.test(form.rating)) {
      setError("Rating must be a whole number from 1 to 5.");
      return;
    }
    setBusy(true);
    try {
      if (!csrfCookie()) await getCsrf();
      await api("/public/points-request/", {
        method: "POST",
        body: JSON.stringify({ ...form, token }),
      });
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We could not send your feedback. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="public-points-page">
        <Card>
          <p className="muted">Loading QR…</p>
        </Card>
      </div>
    );
  if (sent)
    return (
      <div className="public-points-page">
        <Card className="public-points-success">
          <CheckCircle2 size={42} />
          <span className="eyebrow">THANK YOU</span>
          <h1>Feedback sent</h1>
          <p>
            Your feedback for{" "}
            <strong>{info?.gamertag || "this young person"}</strong> has been
            sent to the youth worker for review.
          </p>
          <p className="muted">
            The youth worker decides whether points are awarded and how many.
          </p>
        </Card>
      </div>
    );
  return (
    <div className="public-points-page">
      <Card className="public-points-card">
        <span className="eyebrow">PUBLIC FEEDBACK</span>
        <h1>Recognise a young person</h1>
        <p className="muted">
          You are leaving feedback for{" "}
          <strong>{info?.gamertag || "this young person"}</strong>. A youth
          worker reviews every submission before points are awarded.
        </p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} noValidate>
          <label>
            <span>Your name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={80}
              autoComplete="name"
              required
              placeholder="At least 3 letters"
            />
            <small className="muted">{nameLetters}/3 letters minimum</small>
          </label>
          <label>
            <span>
              Organisation <em>(optional)</em>
            </span>
            <input
              value={form.organisation}
              onChange={(e) =>
                setForm({ ...form, organisation: e.target.value })
              }
              maxLength={1000}
              autoComplete="organization"
              placeholder="Organisation name"
            />
            <small className="muted">{orgWords}/50 words</small>
          </label>
          <label>
            <span>Comment</span>
            <textarea
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              maxLength={500}
              rows={5}
              placeholder="What did they do well?"
            />
            <small className="muted">{form.comment.length}/500</small>
          </label>
          <label>
            <span>Rating out of 5</span>
            <div className="public-rating-field">
              <Star size={19} />
              <input
                type="number"
                inputMode="numeric"
                pattern="[1-5]"
                min={1}
                max={5}
                step={1}
                value={form.rating}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rating: e.target.value.replace(/\D/g, "").slice(0, 1),
                  })
                }
                required
                placeholder="1–5"
              />
              <span>/ 5</span>
            </div>
          </label>
          <input
            className="public-honeypot"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
          />
          <Button type="submit" icon={MessageSquare} disabled={busy}>
            {busy ? "Sending…" : "Send feedback"}
          </Button>
        </form>
        <p className="public-points-privacy">
          <UserRound size={15} /> Your feedback is reviewed by the Youth Quest
          youth worker team. It does not create an account.
        </p>
      </Card>
    </div>
  );
}
