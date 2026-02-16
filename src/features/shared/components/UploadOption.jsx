import { Check } from "lucide-react";

export default function UploadOption({
  icon: Icon,
  title,
  description,
  onClick,
  active,
  disabled,
  features
}) {
  return (
    <button
      className={`p-6 rounded-xl border-2 text-left transition focus:outline-none ${
        active
          ? "border-indigo-500 bg-indigo-50"
          : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex items-start">
        <div className={`p-3 rounded-full ${active ? "bg-indigo-100" : "bg-gray-100"} mr-4`}>
          <Icon className={`h-8 w-8 ${active ? "text-indigo-600" : "text-gray-500"}`} />
        </div>
        <div>
          <h3 className={`font-bold text-lg ${active ? "text-indigo-700" : "text-gray-800"}`}>
            {title}
          </h3>
          <p className="text-gray-600 mt-1">{description}</p>
          {features && (
            <ul className="mt-3 space-y-1">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center text-sm text-gray-500">
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </button>
  );
}
