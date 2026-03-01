"use client"

import React, { useEffect, useState } from 'react';
import { client } from '@/lib/viem';
import FactoryABI from '@/abis/CatLabFactory.json';
import StoreABI from '@/abis/CatLabSecureSensorStore.abi.json';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

const FACTORY_ADDRESS = '0x63bB41b79b5aAc6e98C7b35Dcb0fE941b85Ba5Bb';
const FLOODBOY016_STORE = '0x0994Bc66b2863f8D58C8185b1ed6147895632812';
const UNIVERSAL_SIGNER = '0xcB0e58b011924e049ce4b4D62298Edf43dFF0BDd';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [storeInfo, setStoreInfo] = useState<any>(null);
    const [fields, setFields] = useState<any[]>([]);
    const [latestData, setLatestData] = useState<any>(null);
    const [historicalData, setHistoricalData] = useState<any[]>([]);
    const [activeChart, setActiveChart] = useState<'waterDepth' | 'batteryVoltage'>('waterDepth');
    const [currentBlock, setCurrentBlock] = useState<string>('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Get current block
            const blockNumber = await client.getBlockNumber();
            setCurrentBlock(blockNumber.toString());

            // 2. Get store info
            const [nickname, owner, sensorCount, deployedBlock, description] = await client.readContract({
                address: FACTORY_ADDRESS,
                abi: FactoryABI,
                functionName: 'getStoreInfo',
                args: [FLOODBOY016_STORE]
            }) as any;

            setStoreInfo({ nickname, owner, sensorCount: Number(sensorCount), deployedBlock: Number(deployedBlock), description });

            // 3. Get fields configuration
            const storeFields = await client.readContract({
                address: FLOODBOY016_STORE,
                abi: StoreABI,
                functionName: 'getAllFields'
            }) as any;

            setFields(storeFields);

            // 4. Get latest record
            const [timestamp, values] = await client.readContract({
                address: FLOODBOY016_STORE,
                abi: StoreABI,
                functionName: 'getLatestRecord',
                args: [UNIVERSAL_SIGNER]
            }) as any;

            setLatestData({ timestamp: Number(timestamp), values });

            // 5. Get historical events
            const fromBlock = blockNumber - BigInt(28800);
            const events = await client.getContractEvents({
                address: FLOODBOY016_STORE,
                abi: StoreABI,
                eventName: 'RecordStored',
                fromBlock,
                toBlock: 'latest',
                args: { sensor: UNIVERSAL_SIGNER }
            });

            const waterDepthIndex = storeFields.findIndex((f: any) =>
                f.name.toLowerCase().includes('water_depth') && !f.name.includes('min') && !f.name.includes('max')
            );

            const batteryVoltageIndex = storeFields.findIndex((f: any) =>
                f.name.toLowerCase().includes('battery_voltage') && !f.name.includes('min') && !f.name.includes('max')
            );

            const chartData = events.map(event => {
                const args = (event as any).args;
                return {
                    timestamp: Number(args.timestamp) * 1000,
                    dateFormatted: format(new Date(Number(args.timestamp) * 1000), 'HH:mm'),
                    waterDepth: waterDepthIndex >= 0 ? Number(args.values[waterDepthIndex]) / 10000 : null,
                    batteryVoltage: batteryVoltageIndex >= 0 ? Number(args.values[batteryVoltageIndex]) / 100 : null,
                };
            }).sort((a, b) => a.timestamp - b.timestamp);

            // Very simple smoothing (moving average of 3)
            const smoothedData = chartData.map((point, i, arr) => {
                if (i === 0 || i === arr.length - 1) return point;
                const prev = arr[i - 1];
                const next = arr[i + 1];
                return {
                    ...point,
                    waterDepth: point.waterDepth !== null && prev.waterDepth !== null && next.waterDepth !== null
                        ? (prev.waterDepth + point.waterDepth + next.waterDepth) / 3
                        : point.waterDepth,
                    batteryVoltage: point.batteryVoltage !== null && prev.batteryVoltage !== null && next.batteryVoltage !== null
                        ? (prev.batteryVoltage + point.batteryVoltage + next.batteryVoltage) / 3
                        : point.batteryVoltage
                };
            });

            setHistoricalData(smoothedData);

        } catch (err) {
            console.error(err);
            setError("Failed to fetch data from the blockchain. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    const processValue = (value: number, unit: string) => {
        const baseUnit = unit.replace(/ x\d+/, '');
        if (unit.includes('x10000')) return (Number(value) / 10000).toFixed(4) + ' ' + baseUnit;
        if (unit.includes('x1000')) return (Number(value) / 1000).toFixed(3) + ' ' + baseUnit;
        if (unit.includes('x100')) return (Number(value) / 100).toFixed(3) + ' ' + baseUnit;
        return value + ' ' + unit;
    };

    const formatFieldName = (fieldName: string) => {
        return fieldName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    const truncateAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 10)}...${address.slice(-6)}`;
    };

    if (loading && !storeInfo) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4 text-blue-600">
                    <RefreshCw className="h-10 w-10 animate-spin" />
                    <p className="font-semibold text-lg animate-pulse">Syncing with JIBCHAIN L1...</p>
                </div>
            </div>
        );
    }

    // Find min/max values dynamically for the table
    const renderTableRows = () => {
        if (!fields.length || !latestData) return null;

        // Group fields by their base name to combine current, min, max
        const groupedFields: Record<string, any> = {};
        let waterDepthCount = 0; // Will be extracted from 'water_depth_count' metric

        // First pass to get the count metric if it exists
        fields.forEach((field, i) => {
            if (field.name.toLowerCase() === 'water_depth_count') {
                waterDepthCount = Number(latestData.values[i]);
            }
        });

        fields.forEach((field, i) => {
            if (field.name.toLowerCase() === 'water_depth_count') return;

            const baseNameMatch = field.name.match(/^(.*?)_(min|max)$/);
            const isMinOrMax = !!baseNameMatch;
            const originalName = isMinOrMax ? baseNameMatch[1] : field.name;

            if (!groupedFields[originalName]) {
                groupedFields[originalName] = { name: originalName, current: '-', min: '-', max: '-', unit: field.unit };
            }

            const val = processValue(latestData.values[i], field.unit);
            if (field.name.includes('_min')) {
                groupedFields[originalName].min = val;
            } else if (field.name.includes('_max')) {
                groupedFields[originalName].max = val;
            } else {
                groupedFields[originalName].current = val;
            }
        });

        return Object.values(groupedFields).map((row, idx) => {
            const displayName = row.name.toLowerCase() === 'water_depth' && waterDepthCount > 0
                ? `Water Depth (${waterDepthCount} samples)`
                : formatFieldName(row.name);

            return (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{displayName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">{row.current}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{row.min !== '-' ? row.min : row.current}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{row.max !== '-' ? row.max : row.current}</td>
                </tr>
            );
        });
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <AlertCircle className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    {/* Header Section */}
                    <div className="px-6 py-8 md:px-10 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                            <div>
                                <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-1">Latest Sensor Data</p>
                                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">{storeInfo?.nickname || 'Loading...'}</h1>
                                <p className="text-gray-500 mt-2 text-lg">{storeInfo?.description || 'Synchronizing with blockchain...'}</p>
                            </div>

                            <div className="flex flex-col gap-2 md:items-end">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-sm font-medium">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                    </span>
                                    Current Block: {currentBlock || '---'}
                                </div>
                                {latestData && (
                                    <p className="text-sm text-gray-500">
                                        Last Updated: {format(new Date(latestData.timestamp * 1000), 'h:mm:ss a')}
                                    </p>
                                )}
                                <a
                                    href={`https://exp.jibchain.net/address/${FLOODBOY016_STORE}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                                >
                                    {truncateAddress(FLOODBOY016_STORE)} <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="px-6 py-8 md:px-10">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                            <h2 className="text-xl font-bold text-gray-800">
                                {activeChart === 'waterDepth' ? 'Water Depth Over Time' : 'Battery Voltage Over Time'}
                            </h2>

                            <div className="inline-flex bg-gray-100 rounded-lg p-1">
                                <button
                                    onClick={() => setActiveChart('waterDepth')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeChart === 'waterDepth'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    Water Depth
                                </button>
                                <button
                                    onClick={() => setActiveChart('batteryVoltage')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeChart === 'batteryVoltage'
                                        ? 'bg-white text-emerald-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    Battery Voltage
                                </button>
                            </div>
                        </div>

                        <div className="h-80 w-full relative">
                            {historicalData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={historicalData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis
                                            dataKey="dateFormatted"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#6B7280', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#6B7280', fontSize: 12 }}
                                            dx={-10}
                                            domain={['dataMin - 0.05', 'dataMax + 0.05']}
                                        />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ color: '#4B5563', fontWeight: 600, marginBottom: '4px' }}
                                            formatter={(value: number | undefined) => {
                                                if (value === undefined) return ['-', activeChart === 'waterDepth' ? 'meters' : 'volts'];
                                                return [
                                                    value.toFixed(activeChart === 'waterDepth' ? 4 : 2),
                                                    activeChart === 'waterDepth' ? 'meters' : 'volts'
                                                ];
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={activeChart}
                                            stroke={activeChart === 'waterDepth' ? '#3B82F6' : '#10B981'}
                                            strokeWidth={3}
                                            dot={false}
                                            activeDot={{ r: 6, strokeWidth: 0 }}
                                            animationDuration={1000}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                                    <p className="text-gray-500 font-medium">No historical data available for the selected timeframe</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Data Table Section */}
                    <div className="px-6 py-6 md:px-10 bg-white border-t border-gray-100">
                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Metric</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Current</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Min</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Max</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {renderTableRows()}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer Section */}
                    <div className="bg-gray-50 border-t border-gray-100 px-6 py-5 md:px-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-500">
                            <div>
                                <span className="block font-semibold text-gray-700 mb-1">Last Updated</span>
                                {latestData ? format(new Date(latestData.timestamp * 1000), 'MM/dd/yyyy, h:mm:ss a') : '---'}
                            </div>
                            <div>
                                <span className="block font-semibold text-gray-700 mb-1">Store Owner</span>
                                <a
                                    href={`https://exp.jibchain.net/address/${storeInfo?.owner}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                    {truncateAddress(storeInfo?.owner)} <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                            <div>
                                <span className="block font-semibold text-gray-700 mb-1">Deployed Block</span>
                                <a
                                    href={`https://exp.jibchain.net/block/${storeInfo?.deployedBlock}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                    #{storeInfo?.deployedBlock} <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                            <div>
                                <span className="block font-semibold text-gray-700 mb-1">Security</span>
                                {storeInfo?.sensorCount} authorized sensor
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
