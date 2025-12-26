import React from 'react';
import { HelpCircle } from 'lucide-react';
import { ProviderConfig } from '~/constants/projectConfig';

interface ProviderConfigFormProps {
    config: ProviderConfig;
    value: Record<string, any>;
    onChange: (value: Record<string, any>) => void;
    llmOptions?: { label: string; value: string }[];
}

export default function ProviderConfigForm({
    config,
    value,
    onChange,
    llmOptions = [],
}: ProviderConfigFormProps) {
    const handleChange = (key: string, val: any) => {
        onChange({
            ...value,
            [key]: val,
        });
    };

    return (
        <div className="space-y-4">
            {config.fields.map((field) => (
                <div key={field.key} className="space-y-1">
                    <div className="flex items-center gap-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {field.label}
                            {field.required && <span className="ml-0.5 text-red-500">*</span>}
                        </label>
                        {field.tip && (
                            <div className="group relative cursor-help">
                                <HelpCircle className="h-3 w-3 text-gray-400" />
                                <div className="absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-xs text-white shadow group-hover:block z-10">
                                    {field.tip}
                                </div>
                            </div>
                        )}
                    </div>

                    {field.type === 'text' && (
                        <input
                            type="text"
                            value={value[field.key] || ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            placeholder={field.placeholder || (field.default ? String(field.default) : '')}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    )}

                    {field.type === 'password' && (
                        <input
                            type="password"
                            value={value[field.key] || ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    )}

                    {field.type === 'number' && (
                        <input
                            type="number"
                            value={value[field.key] ?? field.default ?? ''}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                handleChange(field.key, isNaN(val) ? undefined : val);
                            }}
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    )}

                    {field.type === 'switch' && (
                        <div className="flex items-center">
                            <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    checked={value[field.key] ?? field.default ?? false}
                                    onChange={(e) => handleChange(field.key, e.target.checked)}
                                    className="peer sr-only"
                                />
                                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"></div>
                            </label>
                        </div>
                    )}

                    {(field.type === 'select' || field.type === 'llm-select') && (
                        <select
                            value={value[field.key] ?? field.default ?? ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                            {field.type === 'llm-select' ? (
                                <>
                                    <option value="">选择 LLM</option>
                                    {llmOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </>
                            ) : (
                                field.options?.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))
                            )}
                        </select>
                    )}

                    {field.type === 'textarea' && (
                        <textarea
                            value={value[field.key] || ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    )}
                </div>
            ))}
        </div>
    );
}
