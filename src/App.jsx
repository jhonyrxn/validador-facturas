import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRightLeft, 
  Loader2, 
  Table as TableIcon,
  Search,
  DollarSign,
  Download,
  History,
  Trash2,
  Plus,
  ChevronRight,
  Settings,
  Database,
  ClipboardPaste,
  Save,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

// Datos iniciales por defecto
const DEFAULT_MAPPINGS = [
  {
    id: 'base-alpina-default',
    name: 'ALPINA (EJEMPLO)',
    items: [
      { sap: "2898", prov: "4196", nombreSap: "PRODUCTO 2898", nombreProv: "PROV 4196" },
      { sap: "3858", prov: "1014", nombreSap: "QUESO SABANA INST 25 TAJ 417G ALPINA", nombreProv: "Q SABA INST 25 TAJ 417G" }
    ]
  }
];

const apiKey = "AIzaSyBeqM1jz5wY9DcgL_JP8d2fHlKtN4jcikM"; 

export default function App() {
  const [activeTab, setActiveTab] = useState('compare');
  const [invoiceImage, setInvoiceImage] = useState(null);
  const [poImage, setPoImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  // --- PERSISTENCIA CORREGIDA (LAZY INITIALIZATION) ---
  
  const [allMappings, setAllMappings] = useState(() => {
    const saved = localStorage.getItem('conciliator_mappings_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_MAPPINGS;
      }
    }
    return DEFAULT_MAPPINGS;
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('conciliator_history_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [selectedMappingId, setSelectedMappingId] = useState(allMappings[0]?.id || '');
  const [newBaseName, setNewBaseName] = useState('');
  const [pasteData, setPasteData] = useState('');

  useEffect(() => {
    localStorage.setItem('conciliator_mappings_v2', JSON.stringify(allMappings));
  }, [allMappings]);

  useEffect(() => {
    localStorage.setItem('conciliator_history_v2', JSON.stringify(history));
  }, [history]);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (e) => reject(e);
  });

  const handleCreateMapping = () => {
    if (!newBaseName.trim() || !pasteData.trim()) {
      setError("Por favor ingresa un nombre y pega los datos de Excel.");
      return;
    }

    const lines = pasteData.trim().split('\n');
    const newItems = lines.map(line => {
      const parts = line.split(/\t|;|,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (parts.length >= 4) {
        return {
          sap: parts[0].trim(),
          nombreSap: parts[1].trim(),
          prov: parts[2].trim(),
          nombreProv: parts[3].trim()
        };
      } else if (parts.length >= 2) {
        return {
          sap: parts[0].trim(),
          nombreSap: "Manual",
          prov: parts[1].trim(),
          nombreProv: "Manual"
        };
      }
      return null;
    }).filter(item => item !== null);

    if (newItems.length === 0) {
      setError("Formato no válido. Usa 2 o 4 columnas.");
      return;
    }

    const newMapping = {
      id: 'base-' + Date.now(),
      name: newBaseName.toUpperCase(),
      items: newItems
    };

    setAllMappings(prev => [...prev, newMapping]);
    setNewBaseName('');
    setPasteData('');
    setError(null);
  };

  const deleteMapping = (id) => {
    if (allMappings.length <= 1) return;
    if (window.confirm("¿Eliminar esta base de datos definitivamente?")) {
      setAllMappings(prev => prev.filter(m => m.id !== id));
      if (selectedMappingId === id) setSelectedMappingId(allMappings[0].id);
    }
  };

  const callGeminiWithRetry = async (payload, retries = 5, delay = 1000) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (response.ok) return await response.json();
      } catch (err) {
        if (i === retries) throw err;
      }
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
    throw new Error("No se pudo conectar con el servidor de IA.");
  };

  const processImages = async () => {
    if (!invoiceImage || !poImage) {
      setError("Carga ambos documentos.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const invoiceBase64 = await fileToBase64(invoiceImage);
      const poBase64 = await fileToBase64(poImage);
      const activeMapping = allMappings.find(m => m.id === selectedMappingId);

      const prompt = `
        Analiza Factura y Orden de Compra SAP.
        REGLAS:
        1. IGNORA LAPICERO.
        2. Factura: codProducto, descripcion, cantidad, totalBruto, descuento.
        3. OC SAP: codSap, nombreMaterial, precioUnitario.
        JSON SIN MARKDOWN:
        {
          "factura": [{ "codProducto": string, "descripcion": string, "cantidad": number, "totalBruto": number, "descuento": number }],
          "ordenCompra": [{ "codSap": string, "nombreMaterial": string, "precioUnitario": number }]
        }
      `;

      const payload = {
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: invoiceImage.type, data: invoiceBase64 } },
            { inlineData: { mimeType: poImage.type, data: poBase64 } }
          ]
        }]
      };

      const data = await callGeminiWithRetry(payload);
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) throw new Error("Sin respuesta de IA.");

      const cleanJson = textResponse.replace(/```json|```/g, "").trim();
      const parsedData = JSON.parse(cleanJson);
      
      const comp = compareData(parsedData, activeMapping.items);
      setResults(comp);
      addToHistory(comp, activeMapping.name);

    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const compareData = (data, mappingItems) => {
    const { factura = [], ordenCompra = [] } = data;
    return factura.map(itemProv => {
      const cleanProv = String(itemProv.codProducto || "").trim().replace(/^0+/, '');
      const mapping = mappingItems.find(m => String(m.prov || "").trim().replace(/^0+/, '') === cleanProv);
      const sapSku = mapping ? mapping.sap : "No Homologado";
      const itemPo = ordenCompra.find(oc => String(oc.codSap || "").trim().replace(/^0+/, '') === String(sapSku).trim().replace(/^0+/, ''));
      
      const pFactura = (parseFloat(itemProv.totalBruto) - parseFloat(itemProv.descuento || 0)) / parseFloat(itemProv.cantidad || 1);
      const pSAP = itemPo ? parseFloat(itemPo.precioUnitario) || 0 : 0;
      const diff = pFactura - pSAP;

      return {
        ...itemProv,
        sapSku,
        nombreSap: mapping?.nombreSap || "Desconocido",
        precioFacturaReal: pFactura,
        precioOC: pSAP,
        diferencia: diff,
        tieneDiferencia: Math.abs(diff) > 5
      };
    });
  };

  const addToHistory = (res, provider) => {
    const entry = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      provider,
      itemsCount: res.length,
      errorsCount: res.filter(r => r.tieneDiferencia).length,
      data: res
    };
    setHistory(prev => [entry, ...prev.slice(0, 49)]);
  };

  const exportCSV = (data) => {
    const headers = ["Cod Prov", "SKU SAP", "Descripcion", "Cantidad", "P. Fact Real", "P. OC SAP", "Diferencia"];
    const rows = data.map(r => [r.codProducto, r.sapSku, `"${r.descripcion}"`, r.cantidad, r.precioFacturaReal.toFixed(2), r.precioOC.toFixed(2), r.diferencia.toFixed(2)]);
    const content = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(content);
    link.download = `Cruce_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">
        
        {/* Nav Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border w-fit">
          <button onClick={() => setActiveTab('compare')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'compare' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <ArrowRightLeft size={18} /> Conciliar
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <History size={18} /> Historial
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Database size={18} /> Bases de Homólogos
          </button>
        </div>

        {activeTab === 'compare' && (
          <div className="animate-in fade-in duration-500">
            <header className="mb-8">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Conciliador Inteligente</h1>
              <p className="text-slate-500">Cruce de documentos con validación de precios</p>
            </header>

            <div className="bg-white p-6 rounded-3xl border shadow-sm mb-8 flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                  <Database size={24} />
                </div>
                <div className="min-w-[200px]">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Datos:</label>
                  <select 
                    value={selectedMappingId} 
                    onChange={(e) => setSelectedMappingId(e.target.value)}
                    className="block w-full bg-transparent font-bold text-lg text-slate-800 outline-none"
                  >
                    {allMappings.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.items.length})</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-sm text-slate-400 italic">Los códigos de factura se cruzarán con esta base de datos.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className={`bg-white p-8 rounded-[2.5rem] border-2 border-dashed transition-all ${invoiceImage ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 hover:border-blue-300'}`}>
                <label className="cursor-pointer block text-center">
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => setInvoiceImage(e.target.files[0])} />
                  <div className={`w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center ${invoiceImage ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                    <FileText size={36} />
                  </div>
                  <h3 className="font-black text-lg">Factura</h3>
                  {invoiceImage && <p className="mt-2 text-xs font-bold text-blue-600">{invoiceImage.name}</p>}
                </label>
              </div>

              <div className={`bg-white p-8 rounded-[2.5rem] border-2 border-dashed transition-all ${poImage ? 'border-green-500 bg-green-50/20' : 'border-slate-200 hover:border-green-300'}`}>
                <label className="cursor-pointer block text-center">
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => setPoImage(e.target.files[0])} />
                  <div className={`w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center ${poImage ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                    <Search size={36} />
                  </div>
                  <h3 className="font-black text-lg">Orden SAP</h3>
                  {poImage && <p className="mt-2 text-xs font-bold text-green-600">{poImage.name}</p>}
                </label>
              </div>
            </div>

            <button
              onClick={processImages}
              disabled={isProcessing || !invoiceImage || !poImage}
              className="w-full bg-slate-900 hover:bg-blue-600 disabled:bg-slate-200 text-white py-6 rounded-[2rem] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 mb-12"
            >
              {isProcessing ? <><Loader2 className="animate-spin" /> Procesando...</> : <><CheckCircle2 size={24} /> Validar Precios</>}
            </button>

            {error && (
              <div className="bg-red-50 border-2 border-red-100 text-red-600 p-6 rounded-3xl mb-8 flex items-center gap-4">
                <AlertCircle size={32} /> <p className="font-bold">{error}</p>
              </div>
            )}

            {results && (
              <div className="animate-in slide-in-from-bottom-4 duration-700">
                
                {/* --- PANEL DE RESUMEN EJECUTIVO --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                      <TableIcon size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Revisados</p>
                      <p className="text-2xl font-black text-slate-900 leading-none">{results.length}</p>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
                      <ShieldAlert size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Con Novedad</p>
                      <p className="text-2xl font-black text-red-600 leading-none">{results.filter(r => r.tieneDiferencia).length}</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
                    <div className="p-4 bg-green-50 text-green-600 rounded-2xl">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Sin Novedad</p>
                      <p className="text-2xl font-black text-green-600 leading-none">{results.length - results.filter(r => r.tieneDiferencia).length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[3rem] border shadow-2xl overflow-hidden mb-20">
                  <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                    <h2 className="text-2xl font-black">Detalle de Comparación</h2>
                    <button onClick={() => exportCSV(results)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2">
                      <Download size={18} /> Excel (CSV)
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-8 py-6">SKU Prov → SAP</th>
                          <th className="px-8 py-6">Producto</th>
                          <th className="px-8 py-6 text-right">Cant</th>
                          <th className="px-8 py-6 text-right">P. Real</th>
                          <th className="px-8 py-6 text-right">P. OC</th>
                          <th className="px-8 py-6 text-right">Dif.</th>
                          <th className="px-8 py-6 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map((row, i) => (
                          <tr key={i} className={`hover:bg-slate-50 ${row.tieneDiferencia ? 'bg-red-50/20' : ''}`}>
                            <td className="px-8 py-7">
                              <div className="text-[10px] text-slate-400">{row.codProducto}</div>
                              <div className={`font-black ${row.sapSku === 'No Homologado' ? 'text-orange-600' : 'text-slate-900'}`}>{row.sapSku}</div>
                            </td>
                            <td className="px-8 py-7">
                              <div className="text-sm font-bold text-slate-800">{row.descripcion}</div>
                              <div className="text-[10px] text-slate-400">{row.nombreSap}</div>
                            </td>
                            <td className="px-8 py-7 text-right font-bold">{row.cantidad}</td>
                            <td className="px-8 py-7 text-right font-black">${row.precioFacturaReal.toLocaleString()}</td>
                            <td className="px-8 py-7 text-right text-slate-400">${row.precioOC.toLocaleString()}</td>
                            <td className={`px-8 py-7 text-right font-black ${row.tieneDiferencia ? 'text-red-600' : 'text-green-600'}`}>
                              ${row.diferencia.toLocaleString()}
                            </td>
                            <td className="px-8 py-7 text-center">
                              <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${row.tieneDiferencia ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {row.tieneDiferencia ? 'Revisar' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in slide-in-from-right-4 duration-500">
            <h1 className="text-3xl font-black mb-8">Historial</h1>
            <div className="grid gap-4">
              {history.map(entry => (
                <div key={entry.id} className="bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between hover:border-blue-200">
                  <div>
                    <h4 className="font-black text-slate-800 uppercase">{entry.provider}</h4>
                    <p className="text-xs text-slate-400">{entry.date} • {entry.itemsCount} productos</p>
                  </div>
                  <button onClick={() => { setResults(entry.data); setActiveTab('compare'); }} className="p-4 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-2xl transition-all">
                    <ChevronRight />
                  </button>
                </div>
              ))}
              {history.length === 0 && <p className="text-center py-20 text-slate-400">Sin historial.</p>}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in slide-in-from-left-4 duration-500">
            <h1 className="text-3xl font-black mb-8">Gestor de Homólogos</h1>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="md:col-span-2 bg-white p-8 rounded-[3rem] border shadow-xl">
                <h3 className="text-xl font-black mb-6">Crear Nueva Base</h3>
                <div className="space-y-6">
                  <input 
                    type="text" 
                    value={newBaseName}
                    onChange={(e) => setNewBaseName(e.target.value)}
                    placeholder="Nombre (Ej: ALPINA OCT)"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-500"
                  />
                  <textarea 
                    rows={8}
                    value={pasteData}
                    onChange={(e) => setPasteData(e.target.value)}
                    placeholder="Pega desde Excel (2 o 4 columnas)..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-mono text-sm outline-none focus:border-blue-500"
                  ></textarea>
                  <button onClick={handleCreateMapping} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3">
                    <Save size={20} /> Guardar Base de Datos
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Bases Guardadas:</h3>
                {allMappings.map(mapping => (
                  <div key={mapping.id} className="bg-white p-6 rounded-3xl border shadow-sm group">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-black text-slate-800">{mapping.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{mapping.items.length} Productos</p>
                      </div>
                      <button onClick={() => deleteMapping(mapping.id)} className="text-slate-200 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}