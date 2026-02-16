export default function FeatureStep({ number, title, description }) {
  return (
    <div className="flex items-start">
      <div className="bg-indigo-100 text-indigo-700 rounded-full h-10 w-10 flex items-center justify-center font-bold flex-shrink-0 text-lg">
        {number}
      </div>
      <div className="ml-4">
        <h3 className="font-medium text-lg text-gray-800">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}
