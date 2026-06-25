export default function CallsTable({ calls }) {
  if (!calls?.length) {
    return <p className="empty">No calls found for this period.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date / time</th>
            <th>Destination</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id ?? call.dateTime + call.destination}>
              <td>{call.dateTime ? new Date(call.dateTime).toLocaleString() : '—'}</td>
              <td>{call.destination}</td>
              <td>{call.duration}s</td>
              <td>{call.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
