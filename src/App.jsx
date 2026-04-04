import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRightLeft, 
  Loader2, 
  Search, 
  Download, 
  History, 
  Trash2, 
  Plus, 
  ChevronRight, 
  Database, 
  Save, 
  Camera, 
  ChevronUp, 
  ChevronDown, 
  Globe, 
  Lock,
  Zap,
  LayoutDashboard,
  FileSearch,
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import { auth, db, appId } from './firebase';

// --- CONFIGURACIÓN DE SEGURIDAD ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "Admin123*"; 

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('compare');
  
  const [invoiceImage, setInvoiceImage] = useState<File | null>(null);
  const [poImage, setPoImage] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);
  
  const [publicMappings, setPublicMappings] = useState<any[]>([]);
  const [privateMappings, setPrivateMappings] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [newBaseName, setNewBaseName] = useState('');
  const [pasteData, setPasteData] = useState('');
  const [isPublicBase, setIsPublicBase] = useState(true);
  
  // Estado para la contraseña de administrador
  const [adminPassword, setAdminPassword] = useState('');

  const allMappings = [...publicMappings, ...privateMappings];

  useEffect(() => {
    const initAuth = async () => {
      try {
        // En este entorno, preferimos inicio anónimo si no hay token personalizado
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Error de autenticación:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const pubRef = collection(db, 'artifacts', appId, 'public', 'data', 'mappings');
    const unsubPub = onSnapshot(pubRef, (snap) => {
      const data = snap.docs.map(d => ({...d.data(), id: d.id, isPublic: true}));
      setPublicMappings(data);
      if (data.length > 0 && !selectedMappingId) setSelectedMappingId(data[0].id);
    }, (err) => console.error("Error Firebase Público:", err));

    const privRef = collection(db, 'artifacts', appId, 'users', user.uid, 'mappings');
    const unsubPriv = onSnapshot(privRef, (snap) => {
      const data = snap.docs.map(d => ({...d.data(), id: d.id, isPublic: false}));
      setPrivateMappings(data);
    }, (err) => console.error("Error Firebase Privado:", err));

    const histRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubHist = onSnapshot(histRef, (snap) => {
      const data = snap.docs.map(d => ({...d.data(), id: d.id})) as any[];
      data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setHistory(data);
    }, (err) => console.error("Error Firebase Historial:", err));

    return () => { unsubPub(); unsubPriv(); unsubHist(); };
  }, [user]);

  useEffect(() => {
    if (!selectedMappingId && allMappings.length > 0) {
      setSelectedMappingId(allMappings[0].id);
    }
  }, [allMappings, selectedMappingId]);

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (e) => reject(e);
  });

  const handleCreateMapping = async () => {
    if (!user) {
      setError("Esperando conexión al servidor de la nube...");
      return;
    }
    
    if (isPublicBase && adminPassword !== ADMIN_SECRET) {
      setError("Clave de Administrador incorrecta. Solo el administrador puede crear bases públicas.");
      return;
    }

    if (!newBaseName.trim() || !pasteData.trim()) {
      setError("Por favor ingresa un nombre y pega los datos de Excel.");
      return;
    }

    const lines = pasteData.trim().split('\n');
    const newItems = lines.map(line => {
      const parts = line.split(/\t|;|,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (parts.length >= 4) {
        return { sap: parts[0].trim(), nombreSap: parts[1].trim(), prov: parts[2].trim(), nombreProv: parts[3].trim() };
      } else if (parts.length >= 2) {
        return { sap: parts[0].trim(), nombreSap: "Manual", prov: parts[1].trim(), nombreProv: "Manual" };
      }
      return null;
    }).filter(item => item !== null);

    if (newItems.length === 0) {
      setError("Formato no válido. Usa 2 o 4 columnas.");
      return;
    }

    const mappingId = `base-${Date.now()}`;
    const newMapping = {
      name: newBaseName.toUpperCase(),
      items: newItems,
      createdBy: user.uid,
      timestamp: Date.now()
    };

    try {
      const safeMapping = JSON.parse(JSON.stringify(newMapping));
      
      if (isPublicBase) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mappings', mappingId), safeMapping);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'mappings', mappingId), safeMapping);
      }
      setSelectedMappingId(mappingId);
      setNewBaseName('');
      setPasteData('');
      setAdminPassword(''); 
      setError(null);
      alert(`¡Base de datos ${newMapping.name} guardada exitosamente!`);
    } catch (err) {
      console.error(err);
      setError("Hubo un error al guardar en la base de datos de la nube.");
    }
  };

  const deleteMapping = async (mapping: any) => {
    if (!user) return;
    if (window.confirm(`¿Seguro que deseas eliminar la base de datos "${mapping.name}"?`)) {
      try {
        if (mapping.isPublic) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'mappings', mapping.id));
        } else {
          await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'mappings', mapping.id));
        }
        if (selectedMappingId === mapping.id) setSelectedMappingId('');
      } catch (err) {
        console.error(err);
        alert("Error al intentar eliminar la base.");
      }
    }
  };

  const processImages = async () => {
    if (!invoiceImage || !poImage) {
      setError("Carga ambos documentos o toma las fotos correspondientes.");
      return;
    }
    if (!selectedMappingId && allMappings.length === 0) {
      setError("Por favor selecciona o crea una base de homólogos antes de validar.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");
      
      const ai = new GoogleGenAI({ apiKey });
      const invoiceBase64 = await fileToBase64(invoiceImage);
      const poBase64 = await fileToBase64(poImage);
      const activeMapping = allMappings.find(m => m.id === selectedMappingId) || { items: [] };

      const prompt = `
        Eres un asistente estricto de extracción de datos. Analiza la FACTURA y la ORDEN DE COMPRA adjuntas.
        
        TABLA DE FACTURA:
        - Busca las columnas "COD ITEM" (este es el codProducto), "DESCRIPCION", "CANTIDADES" (cantidad), "VALOR BRUTO" (totalBruto).
        
        TABLA DE ORDEN DE COMPRA:
        - "PART" o "MATERIAL" -> codSap
        - "DESCRIPCION" o "DESCRIPTION" -> nombreMaterial
        - "CANTIDAD" o "QUANTITY" -> cantidad
        - "VALOR UNITARIO / UNIT PRICE" -> precioUnitario. ¡ALERTA! Esta es la 6ta columna. IGNORA POR COMPLETO los valores bajo las columnas "ICUI", "IBUA" o "VALOR TOTAL".

        REGLAS VITALES:
        1. Ignora marcas de agua como "CS CamScanner", firmas o sellos.
        2. Extrae TODAS las filas de TODAS las páginas de ambos documentos. 
        3. NO INVENTES NÚMEROS. Limpia los puntos de miles (ej. 1.272.000 -> 1272000).
        
        Devuelve ESTRICTAMENTE este JSON puro:
        {
          "factura": [{ "codProducto": "string", "descripcion": "string", "cantidad": 0, "totalBruto": 0, "descuento": 0 }],
          "ordenCompra": [{ "codSap": "string", "nombreMaterial": "string", "cantidad": 0, "precioUnitario": 0 }]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: invoiceImage.type, data: invoiceBase64 } },
            { inlineData: { mimeType: poImage.type, data: poBase64 } }
          ]
        },
        config: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const textResponse = response.text;
      if (!textResponse) throw new Error("La IA no devolvió datos.");

      const parsedData = JSON.parse(textResponse);
      
      if (!parsedData.factura || parsedData.factura.length === 0) {
         throw new Error("La IA analizó el documento pero no logró extraer los productos.");
      }

      const comp = compareData(parsedData, activeMapping.items);
      setResults(comp);
      await addToHistory(comp, activeMapping.name || "Base Temporal");
      setIsFormCollapsed(true); 

    } catch (err: any) {
      console.error(err);
      setError("❌ " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const compareData = (data: any, mappingItems: any[]) => {
    const { factura = [], ordenCompra = [] } = data;
    
    const cleanSKU = (sku: any) => {
      const s = String(sku || "").trim().toUpperCase().replace(/\s+/g, '').replace(/^0+/, '');
      return s === "" ? "0" : s;
    };

    return factura.map((itemProv: any) => {
      const cleanProv = cleanSKU(itemProv.codProducto);
      
      let mapping = mappingItems.find(m => cleanSKU(m.prov) === cleanProv);
      let sapSku = mapping ? mapping.sap : null;
      
      if (!mapping) {
        const mapBySap = mappingItems.find(m => cleanSKU(m.sap) === cleanProv);
        if (mapBySap) {
          mapping = mapBySap;
          const existsProvInOC = ordenCompra.some((oc: any) => cleanSKU(oc.codSap) === cleanSKU(mapBySap.prov));
          sapSku = existsProvInOC ? mapBySap.prov : mapBySap.sap;
        }
      }

      if (!sapSku) sapSku = "No Homologado";
      
      const itemPo = ordenCompra.find((oc: any) => cleanSKU(oc.codSap) === cleanSKU(sapSku));
      
      const bruto = parseFloat(String(itemProv.totalBruto).replace(/,/g, '')) || 0;
      const desc = parseFloat(String(itemProv.descuento).replace(/,/g, '')) || 0;
      const cantFactura = parseFloat(String(itemProv.cantidad).replace(/,/g, '')) || 1;
      
      const pSAP = itemPo ? parseFloat(String(itemPo.precioUnitario).replace(/,/g, '')) || 0 : 0;
      const cantSAP = itemPo ? parseFloat(String(itemPo.cantidad).replace(/,/g, '')) || 0 : 0;

      let multiplicador = 1;
      let metodoDeteccion = "Directo";

      const pFacturaDirecto = (bruto - desc) / cantFactura;

      if (itemPo) {
        const diffPrecioDirecto = Math.abs(pFacturaDirecto - pSAP);
        
        if (diffPrecioDirecto <= 10) {
          multiplicador = 1;
          metodoDeteccion = "Directo";
        } else {
          const matchTexto = String(itemProv.descripcion).match(/[xX]\s*(\d+)/);
          const multTexto = (matchTexto && parseInt(matchTexto[1], 10) > 1) ? parseInt(matchTexto[1], 10) : 1;
          
          const precioInferidoTexto = multTexto > 1 ? (bruto - desc) / (cantFactura * multTexto) : pFacturaDirecto;
          const precioInferidoMatematico = cantSAP > 0 ? (bruto - desc) / cantSAP : pFacturaDirecto;
          
          if (cantSAP > cantFactura && Math.abs(precioInferidoMatematico - pSAP) <= 10) {
            multiplicador = cantSAP / cantFactura;
            metodoDeteccion = `Inferencia Matemática (Equivalente x${multiplicador})`;
          }
          else if (multTexto > 1 && Math.abs(precioInferidoTexto - pSAP) <= 10) {
            multiplicador = multTexto;
            metodoDeteccion = `Texto Validado por Precio (Caja x${multiplicador})`;
          }
          else if (multTexto > 1 && Math.abs((cantFactura * multTexto) - cantSAP) < Math.abs(cantFactura - cantSAP)) {
            multiplicador = multTexto;
            metodoDeteccion = `Texto Validado por Cantidad (Caja x${multiplicador})`;
          }
        }
      }

      const cantidadRealCalculada = cantFactura * multiplicador;
      const pFacturaUnidadReal = (bruto - desc) / cantidadRealCalculada;
      
      const diffPrecio = pFacturaUnidadReal - pSAP;
      const diffCant = cantidadRealCalculada - cantSAP;
      
      const tieneDifPrecio = Math.abs(diffPrecio) > 10;
      const tieneDifCant = Math.abs(diffCant) > 0.05 && itemPo;

      return {
        ...itemProv,
        sapSku,
        nombreSap: mapping?.nombreSap || "No en base de datos",
        precioFacturaReal: pFacturaUnidadReal,
        precioOC: pSAP,
        cantSAP,
        diferenciaPrecio: diffPrecio,
        diferenciaCantidad: diffCant,
        tieneDiferencia: tieneDifPrecio || tieneDifCant,
        tieneDifPrecio,
        tieneDifCant,
        multiplicador,
        metodoDeteccion,
        cantFacturaOriginal: cantFactura,
        cantRealTotal: cantidadRealCalculada,
        encontradoEnOC: !!itemPo
      };
    });
  };

  const addToHistory = async (res: any[], provider: string) => {
    if (!user) return;
    const histId = `hist-${Date.now()}`;
    
    const entry = {
      date: new Date().toLocaleString(),
      provider: provider || "Desconocido",
      itemsCount: res.length,
      errorsCount: res.filter(r => r.tieneDiferencia).length,
      data: res,
      timestamp: Date.now()
    };

    try {
      const safeEntry = JSON.parse(JSON.stringify(entry));
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', histId), safeEntry);
    } catch (err) {
      console.error("No se pudo guardar el historial", err);
    }
  };

  const exportCSV = (data: any[]) => {
    const headers = [
      "Cod Prov", "SKU SAP", "Descripcion", "Cant Factura", "Multiplicador", 
      "Total Unds", "Cant OC SAP", "Dif Cantidad", "P. Fact Real Und", "P. OC SAP", "Dif Precio", "Método Detección"
    ];
    const rows = data.map(r => [
      r.codProducto, r.sapSku, `"${r.descripcion}"`, r.cantFacturaOriginal, `x${r.multiplicador}`,
      r.cantRealTotal, r.cantSAP, r.diferenciaCantidad, r.precioFacturaReal.toFixed(2), 
      r.precioOC.toFixed(2), r.diferenciaPrecio.toFixed(2), `"${r.metodoDeteccion}"`
    ]);
    const content = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(content);
    link.download = `Cruce_${Date.now()}.csv`;
    link.click();
  };

  const UploadCard = ({ title, fileData, setFileData, colorTheme, icon: Icon }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-6 rounded-[2rem] border-2 border-dashed transition-all ${fileData ? `border-${colorTheme}-500/50 bg-${colorTheme}-500/5` : 'border-zinc-800'} flex flex-col justify-center relative overflow-hidden group`}
    >
      {fileData && (
        <div className={`absolute top-0 right-0 p-2 bg-${colorTheme}-500/20 text-${colorTheme}-400 rounded-bl-2xl`}>
          <CheckCircle2 size={16} />
        </div>
      )}
      <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-transform group-hover:scale-110 duration-300 ${fileData ? `bg-${colorTheme}-500/20 text-${colorTheme}-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]` : 'bg-zinc-800 text-zinc-500'}`}>
        <Icon size={32} />
      </div>
      <h3 className="font-bold text-lg text-center mb-4 text-zinc-200">{title}</h3>
      
      {fileData ? (
        <div className="flex flex-col items-center">
          <p className={`text-xs font-medium text-${colorTheme}-400 truncate max-w-[200px] bg-${colorTheme}-500/10 py-1.5 px-4 rounded-full mb-3 border border-${colorTheme}-500/20`}>
            {fileData.name}
          </p>
          <button onClick={() => setFileData(null)} className="text-xs text-red-400/70 font-bold hover:text-red-400 transition-colors">Quitar y volver a subir</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-auto">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95">
            <Upload size={18} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Archivo</span>
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { if(e.target.files?.[0]) setFileData(e.target.files[0]) }} />
          </label>
          <label className={`cursor-pointer bg-${colorTheme}-600/20 hover:bg-${colorTheme}-600/30 text-${colorTheme}-400 border border-${colorTheme}-500/30 py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95`}>
            <Camera size={18} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Cámara</span>
            <input type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => { if(e.target.files?.[0]) setFileData(e.target.files[0]) }} />
          </label>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8 font-sans text-zinc-300 selection:bg-electric-blue/30">
      {/* Background Glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-electric-blue/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-violet/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-12 glass-card p-2 rounded-2xl border-zinc-800/50">
          <div className="flex items-center gap-3 px-4">
            <div className="w-10 h-10 rounded-xl animate-gradient flex items-center justify-center shadow-lg">
              <Sparkles className="text-white" size={20} />
            </div>
            <span className="font-black text-xl tracking-tighter text-white">CONCILIADOR<span className="text-electric-blue">.AI</span></span>
          </div>
          
          <div className="flex gap-1">
            {[
              { id: 'compare', icon: ArrowRightLeft, label: 'Conciliar' },
              { id: 'history', icon: History, label: 'Historial' },
              { id: 'settings', icon: Database, label: 'Bases' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)} 
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all relative ${activeTab === tab.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                {activeTab === tab.id && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-zinc-800 rounded-xl -z-10" />
                )}
                <tab.icon size={18} className={activeTab === tab.id ? 'text-electric-blue' : ''} /> 
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'compare' && (
            <motion.div 
              key="compare"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-black text-white tracking-tight mb-2">Panel de Conciliación</h1>
                  <p className="text-zinc-500 max-w-xl">Extracción inteligente de datos con Gemini 3.1 Flash. Cruce de precios y cantidades con tolerancia automática.</p>
                </div>
                {results && (
                  <button 
                    onClick={() => setIsFormCollapsed(!isFormCollapsed)}
                    className="glass-card px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-zinc-400 hover:text-white transition-all border-zinc-800"
                  >
                    {isFormCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    {isFormCollapsed ? 'Mostrar Carga' : 'Ocultar Carga'}
                  </button>
                )}
              </header>

              {!isFormCollapsed && (
                <div className="space-y-6">
                  <div className="glass-card p-6 rounded-3xl border-zinc-800/50 flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="p-3 bg-electric-blue/10 text-electric-blue rounded-2xl border border-electric-blue/20">
                        <Database size={24} />
                      </div>
                      <div className="w-full">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Base de Datos Activa</label>
                        <select 
                          value={selectedMappingId} 
                          onChange={(e) => setSelectedMappingId(e.target.value)}
                          className="block w-full bg-zinc-800/50 border border-zinc-700 p-2.5 rounded-xl font-bold text-white outline-none cursor-pointer focus:border-electric-blue/50 transition-all"
                        >
                          <optgroup label="🌐 Bases Compartidas">
                            {publicMappings.map(m => <option key={m.id} value={m.id}>{m.name} ({m.items.length})</option>)}
                          </optgroup>
                          <optgroup label="🔒 Bases Privadas">
                            {privateMappings.map(m => <option key={m.id} value={m.id}>{m.name} ({m.items.length})</option>)}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <UploadCard title="Factura Proveedor" fileData={invoiceImage} setFileData={setInvoiceImage} colorTheme="blue" icon={FileText} />
                    <UploadCard title="Orden SAP" fileData={poImage} setFileData={setPoImage} colorTheme="violet" icon={Search} />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={processImages}
                    disabled={isProcessing || !invoiceImage || !poImage || (!selectedMappingId && allMappings.length === 0)}
                    className="w-full animate-gradient text-white py-5 rounded-3xl font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <><Loader2 className="animate-spin" /> <span className="animate-pulse">Analizando con Flash AI...</span></>
                    ) : (
                      <><Zap size={24} className="fill-current" /> Iniciar Conciliación</>
                    )}
                  </motion.button>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-3xl flex items-center gap-4"
                    >
                      <AlertCircle size={32} className="shrink-0" /> 
                      <p className="font-bold">{error}</p>
                    </motion.div>
                  )}
                </div>
              )}

              {results && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Items', value: results.length, color: 'zinc' },
                      { label: 'Conciliados', value: results.filter(r => !r.tieneDiferencia).length, color: 'emerald' },
                      { label: 'Dif. Cantidad', value: results.filter(r => r.tieneDifCant).length, color: 'orange' },
                      { label: 'Dif. Precio', value: results.filter(r => r.tieneDifPrecio).length, color: 'red' }
                    ].map((stat, i) => (
                      <div key={i} className="glass-card p-5 rounded-3xl border-zinc-800/50">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                        <p className={`text-3xl font-black text-${stat.color}-400 leading-none`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="glass-card rounded-[2.5rem] border-zinc-800/50 overflow-hidden">
                    <div className="p-6 md:p-8 border-b border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <h2 className="text-xl font-black text-white">Resultados del Cruce</h2>
                      <button onClick={() => exportCSV(results)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 border border-zinc-700 transition-all text-sm">
                        <Download size={18} /> Exportar Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[1000px]">
                        <thead className="bg-zinc-900/50 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-5">Identificación</th>
                            <th className="px-6 py-5">Descripción</th>
                            <th className="px-6 py-5 text-center">Cant. Fact</th>
                            <th className="px-6 py-5 text-center">Ajuste</th>
                            <th className="px-6 py-5 text-center">Total Real</th>
                            <th className="px-6 py-5 text-center">Cant. OC</th>
                            <th className="px-6 py-5 text-center">Dif. Cant</th>
                            <th className="px-6 py-5 text-right">P. Real</th>
                            <th className="px-6 py-5 text-right">P. OC</th>
                            <th className="px-6 py-5 text-right">Dif. Precio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {results.map((row, i) => (
                            <tr key={i} className={`hover:bg-zinc-800/30 transition-colors ${row.tieneDiferencia ? 'bg-red-500/5' : ''}`}>
                              <td className="px-6 py-5">
                                <div className={`font-black text-sm ${row.sapSku === 'No Homologado' ? 'text-orange-400' : 'text-zinc-200'}`}>{row.sapSku}</div>
                                <div className="text-[10px] text-zinc-500">Prov: {row.codProducto}</div>
                              </td>
                              <td className="px-6 py-5 max-w-[200px]">
                                <div className="text-[11px] font-black text-electric-blue truncate mb-1">OC: {row.nombreSap}</div>
                                <div className="text-xs text-zinc-400 leading-tight line-clamp-2">FAC: {row.descripcion}</div>
                              </td>
                              <td className="px-6 py-5 text-center font-bold text-zinc-500">{row.cantFacturaOriginal}</td>
                              <td className="px-6 py-5 text-center">
                                {row.multiplicador > 1 ? (
                                  <span className="inline-flex items-center gap-1 bg-neon-violet/20 text-neon-violet px-2 py-1 rounded-lg text-[10px] font-black border border-neon-violet/20">
                                    <Zap size={10} /> x{row.multiplicador}
                                  </span>
                                ) : <span className="text-zinc-700">-</span>}
                              </td>
                              <td className="px-6 py-5 text-center font-black text-zinc-200">{row.cantRealTotal}</td>
                              <td className="px-6 py-5 text-center font-bold text-zinc-400">{row.cantSAP}</td>
                              <td className="px-6 py-5 text-center font-black">
                                {row.diferenciaCantidad > 0 ? (
                                  <span className="text-red-400 text-xs">+ {row.diferenciaCantidad}</span>
                                ) : row.diferenciaCantidad < 0 ? (
                                  <span className="text-orange-400 text-xs">{row.diferenciaCantidad}</span>
                                ) : (
                                  <CheckCircle2 size={16} className="mx-auto text-emerald-500" />
                                )}
                              </td>
                              <td className="px-6 py-5 text-right font-black text-zinc-200">
                                ${row.precioFacturaReal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                              </td>
                              <td className="px-6 py-5 text-right text-zinc-500 font-bold">
                                ${row.precioOC.toLocaleString(undefined, {minimumFractionDigits: 2})}
                              </td>
                              <td className={`px-6 py-5 text-right font-black ${row.tieneDifPrecio ? 'text-red-400' : 'text-emerald-400'}`}>
                                ${row.diferenciaPrecio.toLocaleString(undefined, {minimumFractionDigits: 2})}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <h1 className="text-4xl font-black text-white tracking-tight">Historial de Auditoría</h1>
              <div className="grid gap-4">
                {history.map(entry => (
                  <div key={entry.id} className="glass-card p-6 rounded-3xl border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between hover:border-electric-blue/30 transition-all gap-4 group">
                    <div>
                      <h4 className="font-black text-white uppercase text-lg group-hover:text-electric-blue transition-colors">{entry.provider}</h4>
                      <p className="text-xs text-zinc-500 font-medium">{entry.date}</p>
                    </div>
                    <div className="flex items-center gap-6 bg-zinc-900/50 px-6 py-3 rounded-2xl border border-zinc-800">
                      <div className="text-center">
                        <p className="text-[10px] font-black text-zinc-500 uppercase">Items</p>
                        <p className="font-black text-zinc-300">{entry.itemsCount}</p>
                      </div>
                      <div className="w-px h-8 bg-zinc-800"></div>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-red-400 uppercase">Alertas</p>
                        <p className={`font-black ${entry.errorsCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{entry.errorsCount}</p>
                      </div>
                    </div>
                    <button onClick={() => { setResults(entry.data); setIsFormCollapsed(true); setActiveTab('compare'); }} className="bg-electric-blue hover:bg-electric-blue/80 text-white px-8 py-3 rounded-2xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg shadow-electric-blue/20">
                      Ver Reporte <ChevronRight size={18} />
                    </button>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-24 glass-card rounded-[3rem] border-zinc-800/50">
                    <History size={64} className="mx-auto text-zinc-800 mb-6" />
                    <p className="text-zinc-500 font-medium text-lg">No hay registros de auditoría disponibles.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h1 className="text-4xl font-black text-white tracking-tight mb-2">Gestión de Homólogos</h1>
                <p className="text-zinc-500">Administra las equivalencias de SKUs entre proveedores y SAP.</p>
              </header>

              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 glass-card p-8 md:p-10 rounded-[3rem] border-zinc-800/50">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3 text-white">
                    <Plus className="text-electric-blue" /> Nueva Base de Datos
                  </h3>
                  
                  <div className="space-y-8">
                    <div>
                      <label className="text-xs font-black text-zinc-500 uppercase mb-3 block tracking-widest">Nombre Identificador</label>
                      <input 
                        type="text" 
                        value={newBaseName}
                        onChange={(e) => setNewBaseName(e.target.value)}
                        placeholder="Ej: ALPINA NACIONAL"
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 font-bold text-white outline-none focus:border-electric-blue/50 transition-all"
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-black text-zinc-500 uppercase block tracking-widest">Importar desde Excel</label>
                        <span className="text-[10px] text-zinc-600 font-bold bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">SKU SAP | Nombre SAP | SKU Prov | Nombre Prov</span>
                      </div>
                      <textarea 
                        rows={6}
                        value={pasteData}
                        onChange={(e) => setPasteData(e.target.value)}
                        placeholder="Pega las columnas aquí..."
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 font-mono text-sm text-zinc-300 outline-none focus:border-electric-blue/50 transition-all"
                      ></textarea>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
                      <p className="text-xs font-black text-zinc-500 uppercase mb-4 tracking-widest">Visibilidad y Seguridad</p>
                      <div className="flex gap-4 mb-6">
                        <button 
                          onClick={() => setIsPublicBase(true)}
                          className={`flex-1 py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all border ${isPublicBase ? 'bg-electric-blue text-white border-electric-blue shadow-lg shadow-electric-blue/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                        >
                          <Globe size={18} /> Pública
                        </button>
                        <button 
                          onClick={() => setIsPublicBase(false)}
                          className={`flex-1 py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all border ${!isPublicBase ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-lg' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                        >
                          <Lock size={18} /> Privada
                        </button>
                      </div>
                      
                      {isPublicBase && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-3"
                        >
                          <label className="text-xs font-black text-electric-blue uppercase block tracking-widest">Token de Autorización</label>
                          <input 
                            type="password" 
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            placeholder="Clave de administrador..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 font-bold text-white outline-none focus:border-electric-blue/50 transition-all"
                          />
                        </motion.div>
                      )}
                    </div>

                    <button 
                      onClick={handleCreateMapping} 
                      className="w-full animate-gradient text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-2xl transition-all"
                    >
                      <Save size={20} /> Guardar en la Nube
                    </button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="glass-card p-6 rounded-[2.5rem] border-zinc-800/50">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Globe size={14} className="text-electric-blue" /> Bases Públicas
                    </h3>
                    <div className="space-y-3">
                      {publicMappings.map(mapping => (
                        <div key={mapping.id} className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between group">
                          <div>
                            <h4 className="font-bold text-zinc-200 text-sm">{mapping.name}</h4>
                            <p className="text-[10px] text-zinc-500 font-bold">{mapping.items.length} SKUs</p>
                          </div>
                          {mapping.createdBy === user?.uid && (
                            <button onClick={() => deleteMapping(mapping)} className="text-zinc-600 hover:text-red-400 transition-colors p-2">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      {publicMappings.length === 0 && <p className="text-xs text-zinc-600 italic">No hay bases compartidas.</p>}
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-[2.5rem] border-zinc-800/50">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Lock size={14} className="text-zinc-100" /> Bases Privadas
                    </h3>
                    <div className="space-y-3">
                      {privateMappings.map(mapping => (
                        <div key={mapping.id} className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between group">
                          <div>
                            <h4 className="font-bold text-zinc-200 text-sm">{mapping.name}</h4>
                            <p className="text-[10px] text-zinc-500 font-bold">{mapping.items.length} SKUs</p>
                          </div>
                          <button onClick={() => deleteMapping(mapping)} className="text-zinc-600 hover:text-red-400 transition-colors p-2">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {privateMappings.length === 0 && <p className="text-xs text-zinc-600 italic">No hay bases privadas.</p>}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

