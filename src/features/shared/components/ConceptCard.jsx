export default function ConceptCard({ title, description }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
      <h5 className="font-medium text-indigo-700 mb-1">{title}</h5>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}
