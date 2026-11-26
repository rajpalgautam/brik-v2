export default function Fields({ p = {} }: { p?: Record<string, string> }) {
  return (
    <>
      <label>
        Project title
        <input required name="title" maxLength={120} defaultValue={p.title} />
      </label>
      <label>
        Summary
        <textarea name="summary" maxLength={4000} defaultValue={p.summary} />
      </label>
      <label>
        Project type
        <select name="type" defaultValue={p.type}>
          {["academic", "coding", "idea"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select name="status" defaultValue={p.status}>
          {["planning", "active", "completed"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        GitHub repository (optional)
        <input
          type="url"
          name="github_url"
          placeholder="https://github.com/student/project"
          defaultValue={p.github_url ?? ""}
        />
      </label>
    </>
  );
}
