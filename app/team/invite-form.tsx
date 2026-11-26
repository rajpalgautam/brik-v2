"use client";
import { useActionState } from "react";
import Submit from "../button";
import { issue } from "./actions";
export default function InviteForm({
  project,
  reply = null,
}: {
  project: string;
  reply?: string | null;
}) {
  const [state, action] = useActionState(issue.bind(null, project, reply), {
    message: "",
    url: "",
  });
  return (
    <details>
      <summary>{reply ? "Invite this student" : "Create invitation"}</summary>
      <form action={action}>
        <label>
          Team role
          <select name="role">
            <option value="member">Member · can edit and chat</option>
            <option value="viewer">Viewer · read-only, no chat</option>
          </select>
        </label>
        {!reply && (
          <>
            <label>
              Email address (optional)
              <input type="email" name="email" maxLength={254} />
            </label>
            <p>
              Leave the email blank for a shareable link. Email invitations can
              be used once.
            </p>
            <label>
              Maximum uses for a shareable link
              <input
                type="number"
                min={1}
                max={50}
                name="uses"
                defaultValue={5}
              />
            </label>
          </>
        )}
        <Submit>{reply ? "Send invitation" : "Create invitation"}</Submit>
      </form>
      <p role="status">{state.message}</p>
      {state.url && (
        <label>
          Private invitation link
          <input
            readOnly
            value={state.url}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </details>
  );
}
