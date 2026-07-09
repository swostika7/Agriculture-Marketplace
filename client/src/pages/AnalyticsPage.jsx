import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  MdTrendingUp, MdTrendingDown, MdTrendingFlat, MdPeople,
  MdStorefront, MdShoppingBag, MdAttachMoney, MdRefresh,
  MdBarChart, MdShowChart, MdPieChart
} from 'react-icons/md';
import { GiWheat, GiFarmer } from 'react-icons/gi';
import { analyticsAPI } from '../utils/api';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';

const CATEGORY_COLORS = {
  Vegetable:'#2a8f2a', Fruit:'#f59e0b', Grain:'#8b5cf6',
  Dairy:'#0ea5e9', Herb:'#10b981', Other:'#6b7280',
};
const PIE_COLORS = ['#2a8f2a','#f59e0b','#0ea5e9','#8b5cf6','#10b981','#6b7280'];

function TrendIcon({ direction, size = 18 }) {
  if (direction === 'rising')  return <MdTrendingUp  size={size} className="text-green-500"/>;
  if (direction === 'falling') return <MdTrendingDown size={size} className="text-red-500"/>;
  return <MdTrendingFlat size={size} className="text-earth-400"/>;
}

function StatCard({ icon: Icon, label, value, sub, color = 'leaf', trend }) {
  const bgs = { leaf:'bg-leaf-50', harvest:'bg-harvest-50', earth:'bg-earth-100', sky:'bg-sky-50', purple:'bg-purple-50' };
  const txs = { leaf:'text-leaf-600', harvest:'text-harvest-600', earth:'text-earth-700', sky:'text-sky-500', purple:'text-purple-600' };
  return (
    <div className="card flex items-center gap-4 hover:shadow-glow transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${bgs[color]} flex items-center justify-center shrink-0`}>
        <Icon size={24} className={txs[color]}/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-body text-earth-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-display font-bold ${txs[color]}`}>{value}</p>
        {sub && <p className="text-xs text-earth-400 font-body">{sub}</p>}
      </div>
      {trend && <TrendIcon direction={trend}/>}
    </div>
  );
}

function DemandCard({ item, rank }) {
  const colorMap = { rising:'border-green-200 bg-green-50', falling:'border-red-200 bg-red-50', stable:'border-earth-200 bg-earth-50' };
  const textMap  = { rising:'text-green-700', falling:'text-red-600', stable:'text-earth-600' };
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all hover:shadow-card ${colorMap[item.trend.direction]}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold font-mono
            ${rank===1?'bg-harvest-500':rank===2?'bg-earth-400':rank===3?'bg-leaf-500':'bg-earth-300'}`}>
            {rank}
          </div>
          <div>
            <h3 className="font-display font-bold text-earth-800 text-sm leading-tight">{item.cropName}</h3>
            <span className="badge-earth text-xs">{item.category}</span>
          </div>
        </div>
        <TrendIcon direction={item.trend.direction} size={22}/>
      </div>

      {/* Demand bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs font-body text-earth-500 mb-1">
          <span>Demand score</span>
          <span className="font-mono font-bold text-earth-700">{item.demand}</span>
        </div>
        <div className="h-2 bg-earth-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-leaf-400 transition-all"
            style={{ width:`${Math.min(100,(item.demand/100)*100)}%` }}/>
        </div>
      </div>

      {/* Trend message */}
      <p className={`text-xs font-body font-semibold ${textMap[item.trend.direction]} mb-1`}>
        {item.message}
      </p>
      <p className="text-xs font-body text-earth-500 italic">{item.pricePrediction}</p>

      {/* Price */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-earth-200">
        <span className="text-xs text-earth-400 font-body">Current price</span>
        <span className="font-mono font-bold text-leaf-700 text-sm">{npr(item.price)}/unit</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useLanguage();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [lastUpdate,setLastUpdate]= useState(null);
  const [activeChart, setActiveChart] = useState('line');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await analyticsAPI.get();
      setData(res);
      setLastUpdate(new Date());
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 60 seconds for "live" feel
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) return (
    <div className="flex justify-center items-center min-h-[60vh] flex-col gap-4">
      <div className="spinner"/>
      <p className="text-earth-400 font-body text-sm">Loading live analytics…</p>
    </div>
  );

  const { summary = {}, categoryDist = [], topProducts = [], dailyOrders = [] } = data || {};

  const pieData = categoryDist.map(c => ({
    name: c._id, value: c.count, avgPrice: Math.round(c.avgPrice || 0),
  }));

  const risingCount  = topProducts.filter(p => p.trend.direction === 'rising').length;
  const fallingCount = topProducts.filter(p => p.trend.direction === 'falling').length;

  // Format daily orders for chart
  const chartData = dailyOrders.map(d => ({
    date: d._id.slice(5),   // MM-DD
    orders: d.count,
    revenue: Math.round(d.revenue),
  }));

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl flex items-center gap-2">
            <MdBarChart className="text-leaf-500" size={32}/> Live Analytics
          </h1>
          <p className="section-sub">
            System-wide insights · auto-refreshes every 60s
            {lastUpdate && (
              <span className="ml-2 text-earth-400">
                · Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="btn-secondary flex items-center gap-2 self-start">
          <MdRefresh size={18} className={loading ? 'animate-spin' : ''}/>
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MdPeople}      label="Total Users"     value={summary.totalUsers || 0}     color="sky"/>
        <StatCard icon={GiFarmer}      label="Active Farmers"  value={summary.totalFarmers || 0}   color="leaf"/>
        <StatCard icon={MdStorefront}  label="Live Products"   value={summary.totalProducts || 0}  color="harvest"/>
        <StatCard icon={MdShoppingBag} label="Orders / Week"   value={summary.weekOrders || 0}     color="purple" trend="rising"/>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={MdShoppingBag}   label="Total Orders"   value={summary.totalOrders || 0}            color="earth"/>
        <StatCard icon={MdAttachMoney}   label="Total Revenue"  value={npr(summary.totalRevenue || 0)}      color="leaf"/>
        <StatCard icon={MdTrendingUp}    label="Rising Crops"   value={`${risingCount} of ${topProducts.length}`} color="harvest" trend="rising"/>
      </div>

      {/* Daily Orders Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
              <MdShowChart className="text-leaf-500"/> Orders – Last 7 Days
            </h2>
            <p className="text-sm text-earth-400 font-body">Daily order volume and revenue</p>
          </div>
          <div className="flex gap-2">
            {['line','bar'].map(type => (
              <button key={type} onClick={() => setActiveChart(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all
                  ${activeChart===type?'bg-leaf-500 text-white':'bg-earth-100 text-earth-600 hover:bg-earth-200'}`}>
                {type === 'line' ? <MdShowChart size={14}/> : <MdBarChart size={14}/>}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-earth-400 font-body">
            No order data yet this week
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            {activeChart === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede8dc"/>
                <XAxis dataKey="date" tick={{fontSize:12,fill:'#8b7050',fontFamily:'DM Sans'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:12,fill:'#c0af8e'}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{borderRadius:'12px',border:'none',boxShadow:'0 4px 24px rgba(0,0,0,0.08)',fontFamily:'DM Sans'}}/>
                <Legend/>
                <Line type="monotone" dataKey="orders" stroke="#2a8f2a" strokeWidth={3} dot={{fill:'#2a8f2a',r:5}} name="Orders"/>
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede8dc"/>
                <XAxis dataKey="date" tick={{fontSize:12,fill:'#8b7050',fontFamily:'DM Sans'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:12,fill:'#c0af8e'}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{borderRadius:'12px',border:'none',fontFamily:'DM Sans'}}/>
                <Bar dataKey="orders" fill="#2a8f2a" radius={[6,6,0,0]} name="Orders"/>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Category Distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-earth-800 mb-5 flex items-center gap-2">
            <MdPieChart className="text-harvest-500"/> Category Breakdown
          </h2>
          {pieData.length > 0 ? (
            <div className="flex gap-6 items-center">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={{borderRadius:'12px',fontFamily:'DM Sans'}} formatter={(v,n,p)=>[`${v} products`,p.payload.name]}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm font-body">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                      <span className="text-earth-700">{d.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-semibold text-earth-800">{d.value}</span>
                      <span className="text-earth-400 text-xs ml-1">listings</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-earth-400 font-body">No category data</div>
          )}
        </div>

        {/* Trend summary */}
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-earth-800 mb-5 flex items-center gap-2">
            <MdTrendingUp className="text-leaf-500"/> Market Trend Summary
          </h2>
          <div className="space-y-3">
            {[
              { label:'Rising demand crops',   value:risingCount,                      Icon:MdTrendingUp,   color:'text-green-600', bg:'bg-green-50' },
              { label:'Stable demand crops',   value:topProducts.filter(p=>p.trend.direction==='stable').length, Icon:MdTrendingFlat, color:'text-earth-500', bg:'bg-earth-50' },
              { label:'Falling demand crops',  value:fallingCount,                     Icon:MdTrendingDown, color:'text-red-500',   bg:'bg-red-50' },
              { label:'Avg product rating',    value:`${(topProducts.reduce((s,p)=>s+(p.avgRating||0),0)/(topProducts.length||1)).toFixed(1)} ⭐`, Icon:MdShowChart, color:'text-harvest-600', bg:'bg-harvest-50' },
            ].map(row => (
              <div key={row.label} className={`flex items-center justify-between p-3 rounded-xl ${row.bg}`}>
                <div className="flex items-center gap-3">
                  <row.Icon size={18} className={row.color}/>
                  <span className="text-sm font-body text-earth-700">{row.label}</span>
                </div>
                <span className={`font-mono font-bold text-lg ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Demand & Price Prediction Cards */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
            <MdTrendingUp className="text-leaf-500"/> Demand & Price Predictions
          </h2>
          <p className="text-sm text-earth-400 font-body mt-1">
            Based on weekly sales trends · helps farmers decide what to grow and buyers decide when to buy
          </p>
        </div>
        {topProducts.length === 0 ? (
          <div className="card text-center py-12 text-earth-400">
            <GiWheat size={48} className="mx-auto mb-3 opacity-20"/>
            <p className="font-body">Place some orders to generate demand trend data</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {topProducts.map((item, i) => (
              <DemandCard key={item.cropName} item={item} rank={i+1}/>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
