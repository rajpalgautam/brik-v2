"use client";
import { useRef } from "react";
import Fields from "./fields";
import Submit from "./button";
import { saveProject } from "./work";
export default function CreateProject() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button onClick={() => dialog.current?.showModal()}>
        Create project
      </button>
      <dialog ref={dialog} aria-labelledby="create-heading">
        <h2 id="create-heading">Create a private project</h2>
        <form action={saveProject.bind(null, null)}>
          <Fields />
          <div className="row">
            <Submit>Create project</Submit>
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
