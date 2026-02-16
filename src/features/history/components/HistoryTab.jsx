import { List } from "lucide-react";

export default function HistoryTab({ history }) {
  return (
    <div className="bg-white rounded-xl shadow-xl p-8 border border-indigo-100 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <List className="h-6 w-6 mr-2" />
        Exam History
      </h2>
      {history.length === 0 ? (
        <div className="text-gray-500 text-center py-12">No past attempts yet.</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2 px-3 text-gray-700 font-medium">Date</th>
              <th className="py-2 px-3 text-gray-700 font-medium">Subject</th>
              <th className="py-2 px-3 text-gray-700 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {history
              .slice()
              .reverse()
              .map((h, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="py-2 px-3">{new Date(h.timestamp).toLocaleString()}</td>
                  <td className="py-2 px-3">{h.subject}</td>
                  <td className="py-2 px-3">
                    {h.scoreBreakdown.earned}/{h.scoreBreakdown.total}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
