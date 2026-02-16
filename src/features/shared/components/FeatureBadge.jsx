export default function FeatureBadge({ icon: Icon, text }) {
  return (
    <div className="bg-indigo-800 bg-opacity-50 rounded-full px-4 py-1 flex items-center text-sm">
      <Icon className="h-4 w-4 mr-1" />
      {text}
    </div>
  );
}
