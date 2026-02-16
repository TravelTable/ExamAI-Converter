export default function ScoreBar({ label, score, total, color }) {
  const colorClasses = {
    indigo: "bg-indigo-600",
    green: "bg-green-600",
    purple: "bg-purple-600",
    blue: "bg-blue-600"
  };
  const percentage = total === 0 ? 0 : (score / total) * 100;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-gray-600 text-sm">{label}</span>
        <span className="text-gray-800 font-medium">
          {score}/{total}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${colorClasses[color] || "bg-indigo-600"} h-2.5 rounded-full`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}
