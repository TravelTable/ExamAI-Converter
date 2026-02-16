export default function FeatureCard({ icon: Icon, title, description, color }) {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100"
  };
  const iconColorClasses = {
    indigo: "bg-indigo-100 text-indigo-600",
    purple: "bg-purple-100 text-purple-600",
    blue: "bg-blue-100 text-blue-600"
  };

  return (
    <div className={`rounded-xl p-6 border ${colorClasses[color] || colorClasses.indigo} shadow-sm`}>
      <div className={`p-3 rounded-full ${iconColorClasses[color] || iconColorClasses.indigo} inline-block mb-4`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
