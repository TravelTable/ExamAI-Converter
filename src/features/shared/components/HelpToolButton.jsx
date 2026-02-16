export default function HelpToolButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className={`flex flex-col items-center justify-center p-3 rounded-lg transition ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
      }`}
      onClick={onClick}
    >
      <Icon className="h-6 w-6 mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
