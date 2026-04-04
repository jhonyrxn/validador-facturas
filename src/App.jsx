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
  Save,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Camera,
  ChevronUp,
  ChevronDown,
  Globe,
  Lock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- 1. CONFIGURACIÓN DE FIREBASE (TU BASE DE DATOS) ---
const firebaseConfig = {
  apiKey: "AIzaSyD6D-lq0fEt5th1u9kuZci9QmLpUkJFLJc",
  authDomain: "validador-facturas.firebaseapp.com",
  projectId: "validador-facturas",
  storageBucket: "validador-facturas.firebasestorage.app",
  messagingSenderId: "755125519165",
  appId: "1:755125519165:web:d8549562aa396d12db7b54"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'validador-facturas'; 

// --- 2. CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL (GEMINI) ---
const geminiApiKey = "AIzaSyBeqM1jz5wY9DcgL_JP8d2fHlKtN4jcikM"; 

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

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('compare');
  
  const [invoiceImage, setInvoiceImage] = useState(null);
  const [poImage, setPoImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);
  
  const [publicMappings, setPublicMappings] = useState([]);
  const [privateMappings, setPrivateMappings] = useState([]);
  const [history, setHistory] = useState([]);
  
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [newBaseName, setNewBaseName] = useState('');
  const [pasteData, setPasteData] = useState('');
  const [isPublicBase, setIsPublicBase] = useState(true);

  const allMappings = [...publicMappings, ...privateMappings];

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Usando base de datos propia, iniciando sesión anónima...", tokenError);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error de autenticación:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
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
      const data = snap.docs.map(d => ({...d.data(), id: d.id}));
      data.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(data);
    }, (err) => console.error("Error Firebase Historial:", err));

    return () => { unsubPub(); unsubPriv(); unsubHist(); };
  }, [user, appId]);

  useEffect(() => {
    if (!selectedMappingId && allMappings.length > 0) {
      setSelectedMappingId(allMappings[0].id);
    }
  }, [allMappings, selectedMappingId]);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (e) => reject(e);
  });

  const handleCreateMapping = async () => {
    if (!user) {
      setError("Esperando conexión al servidor de la nube...");
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
      setError(null);
      alert(`¡Base de datos ${newMapping.name} guardada en la Nube!`);
    } catch (err) {
      console.error(err);
      setError("Hubo un error al guardar en la base de datos de la nube. Revisa las reglas de seguridad de Firestore.");
    }
  };

  const deleteMapping = async (mapping) => {
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

  const callGeminiWithRetry = async (payload, retries = 2, delay = 1000) => {
    const isLocalEnv = geminiApiKey && geminiApiKey.trim() !== "";
    const selectedModel = isLocalEnv ? "gemini-1.5-pro" : "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiApiKey}`;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) return await response.json();
        
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `Código ${response.status}`;
        
        if (response.status === 401) {
           throw new Error(`Error 401: La Clave de IA (Gemini) es inválida. Asegúrate de no haber pegado la clave de Firebase por error en la variable geminiApiKey.`);
        }
        if (response.status >= 400 && response.status < 500) {
           throw new Error(`Rechazado por IA: ${errorMsg}`);
        }
        throw new Error(`Error de red: ${response.status}`);
      } catch (err) {
        if (i === retries || err.message.includes('FALTA') || err.message.includes('Rechazado') || err.message.includes('401')) throw err;
      }
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
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
      const invoiceBase64 = await fileToBase64(invoiceImage);
      const poBase64 = await fileToBase64(poImage);
      const activeMapping = allMappings.find(m => m.id === selectedMappingId) || { items: [] };

      // PROMPT ULTRA-GUIADO Y CORREGIDO PARA LA COLUMNA DE PRECIO
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
        
        Devuelve ESTRICTAMENTE este JSON puro SIN Markdown alrededor:
        {
          "factura": [{ "codProducto": "string", "descripcion": "string", "cantidad": 0, "totalBruto": 0, "descuento": 0 }],
          "ordenCompra": [{ "codSap": "string", "nombreMaterial": "string", "cantidad": 0, "precioUnitario": 0 }]
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
        }],
        generationConfig: {
          temperature: 0.1, 
          responseMimeType: "application/json"
        }
      };

      const data = await callGeminiWithRetry(payload);
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) throw new Error("La IA no devolvió datos. Intenta nuevamente.");

      let cleanJson = textResponse;
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      } else {
        cleanJson = textResponse.replace(/```json|```/g, "").trim();
      }

      const parsedData = JSON.parse(cleanJson);
      
      if (!parsedData.factura || parsedData.factura.length === 0) {
         throw new Error("La IA analizó el documento pero no logró extraer los productos. Por favor revisa la legibilidad del PDF.");
      }

      const comp = compareData(parsedData, activeMapping.items);
      setResults(comp);
      await addToHistory(comp, activeMapping.name || "Base Temporal");
      setIsFormCollapsed(true); 

    } catch (err) {
      console.error(err);
      setError("❌ " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const compareData = (data, mappingItems) => {
    const { factura = [], ordenCompra = [] } = data;
    
    // Función auxiliar para limpiar códigos (quita espacios, saltos de línea y ceros a la izquierda)
    const cleanSKU = (sku) => {
      const s = String(sku || "").trim().toUpperCase().replace(/\s+/g, '').replace(/^0+/, '');
      return s === "" ? "0" : s;
    };

    return factura.map(itemProv => {
      const cleanProv = cleanSKU(itemProv.codProducto);
      
      // 1. Buscar coincidencia normal
      let mapping = mappingItems.find(m => cleanSKU(m.prov) === cleanProv);
      let sapSku = mapping ? mapping.sap : null;
      
      // 2. Búsqueda Bidireccional (Fallback si pegaron columnas al revés o la factura trae el SAP)
      if (!mapping) {
        const mapBySap = mappingItems.find(m => cleanSKU(m.sap) === cleanProv);
        if (mapBySap) {
          mapping = mapBySap;
          // Si encontramos el código invertido, cruzamos con la OC para ver cuál asignar
          const existsProvInOC = ordenCompra.some(oc => cleanSKU(oc.codSap) === cleanSKU(mapBySap.prov));
          sapSku = existsProvInOC ? mapBySap.prov : mapBySap.sap;
        }
      }

      if (!sapSku) sapSku = "No Homologado";
      
      const itemPo = ordenCompra.find(oc => cleanSKU(oc.codSap) === cleanSKU(sapSku));
      
      const bruto = parseFloat(String(itemProv.totalBruto).replace(/,/g, '')) || 0;
      const desc = parseFloat(String(itemProv.descuento).replace(/,/g, '')) || 0;
      const cantFactura = parseFloat(String(itemProv.cantidad).replace(/,/g, '')) || 1;
      
      const pSAP = itemPo ? parseFloat(String(itemPo.precioUnitario).replace(/,/g, '')) || 0 : 0;
      const cantSAP = itemPo ? parseFloat(String(itemPo.cantidad).replace(/,/g, '')) || 0 : 0;

      let multiplicador = 1;
      let metodoDeteccion = "Directo";

      // 1. Calculamos el precio directo sin alteraciones
      const pFacturaDirecto = (bruto - desc) / cantFactura;

      if (itemPo) {
        const diffPrecioDirecto = Math.abs(pFacturaDirecto - pSAP);
        
        // REGLA DE ORO: Si el precio unitario directo ya coincide con SAP, NO forzamos multiplicadores
        if (diffPrecioDirecto <= 10) {
          multiplicador = 1;
          metodoDeteccion = "Directo";
        } else {
          // 2. Si el precio base difiere, analizamos matemáticamente si se trata de un empaque múltiple
          const matchTexto = String(itemProv.descripcion).match(/[xX]\s*(\d+)/);
          const multTexto = (matchTexto && parseInt(matchTexto[1], 10) > 1) ? parseInt(matchTexto[1], 10) : 1;
          
          const precioInferidoTexto = multTexto > 1 ? (bruto - desc) / (cantFactura * multTexto) : pFacturaDirecto;
          const precioInferidoMatematico = cantSAP > 0 ? (bruto - desc) / cantSAP : pFacturaDirecto;
          
          // Prioridad A: La cantidad de SAP resuelve perfectamente la ecuación del precio
          if (cantSAP > cantFactura && Math.abs(precioInferidoMatematico - pSAP) <= 10) {
            multiplicador = cantSAP / cantFactura;
            metodoDeteccion = `Inferencia Matemática (Equivalente x${multiplicador})`;
          }
          // Prioridad B: El texto (ej. x12) extraído resuelve la ecuación del precio
          else if (multTexto > 1 && Math.abs(precioInferidoTexto - pSAP) <= 10) {
            multiplicador = multTexto;
            metodoDeteccion = `Texto Validado por Precio (Caja x${multiplicador})`;
          }
          // Prioridad C: El texto arregla la cantidad pedida (por si el precio subió, pero la cantidad enviada cuadra en cajas)
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

  const addToHistory = async (res, provider) => {
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

  const exportCSV = (data) => {
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

  const UploadCard = ({ title, fileData, setFileData, colorTheme, icon: Icon }) => (
    <div className={`bg-white p-6 rounded-[2.5rem] border-2 border-dashed transition-all ${fileData ? `border-${colorTheme}-500 bg-${colorTheme}-50/30` : 'border-slate-200'} flex flex-col justify-center`}>
      <div className={`w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center ${fileData ? `bg-${colorTheme}-600 text-white shadow-lg` : 'bg-slate-100 text-slate-400'}`}>
        <Icon size={32} />
      </div>
      <h3 className="font-black text-lg text-center mb-4">{title}</h3>
      
      {fileData ? (
        <div className="flex flex-col items-center">
          <p className={`text-xs font-bold text-${colorTheme}-700 truncate max-w-[200px] bg-${colorTheme}-100 py-1 px-3 rounded-full mb-3`}>
            {fileData.name}
          </p>
          <button onClick={() => setFileData(null)} className="text-xs text-red-500 font-bold hover:underline">Quitar y volver a subir</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-2 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors">
            <Upload size={18} />
            <span className="text-[10px] font-black uppercase">Archivo</span>
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { if(e.target.files[0]) setFileData(e.target.files[0]) }} />
          </label>
          <label className={`cursor-pointer bg-${colorTheme}-600 hover:bg-${colorTheme}-700 text-white py-3 px-2 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md transition-colors`}>
            <Camera size={18} />
            <span className="text-[10px] font-black uppercase">Cámara</span>
            <input type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => { if(e.target.files[0]) setFileData(e.target.files[0]) }} />
          </label>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border w-fit">
          <button onClick={() => setActiveTab('compare')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'compare' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <ArrowRightLeft size={18} /> Conciliar
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <History size={18} /> Historial
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Database size={18} /> Bases de Homólogos
          </button>
        </div>

        {activeTab === 'compare' && (
          <div className="animate-in fade-in duration-500">
            <header className="mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Conciliador Inteligente</h1>
                <p className="text-slate-500">Cruza precios y cantidades con tolerancia automática a cajas</p>
              </div>
              {results && (
                <button 
                  onClick={() => setIsFormCollapsed(!isFormCollapsed)}
                  className="bg-white border shadow-sm px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 text-slate-600 hover:bg-slate-50"
                >
                  {isFormCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  {isFormCollapsed ? 'Mostrar Carga' : 'Ocultar Carga'}
                </button>
              )}
            </header>

            {!isFormCollapsed && (
              <div className="animate-in slide-in-from-top-4 duration-300 mb-8">
                <div className="bg-white p-5 rounded-3xl border shadow-sm mb-6 flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                      <Database size={24} />
                    </div>
                    <div className="w-full">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Datos Activa:</label>
                      <select 
                        value={selectedMappingId} 
                        onChange={(e) => setSelectedMappingId(e.target.value)}
                        className="block w-full bg-slate-50 border border-slate-100 p-2 rounded-xl font-bold text-slate-800 outline-none cursor-pointer mt-1"
                      >
                        <optgroup label="🌐 Bases Compartidas (Empresa)">
                          {publicMappings.map(m => <option key={m.id} value={m.id}>{m.name} ({m.items.length})</option>)}
                        </optgroup>
                        <optgroup label="🔒 Bases Privadas (Solo tú)">
                          {privateMappings.map(m => <option key={m.id} value={m.id}>{m.name} ({m.items.length})</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <UploadCard title="Factura Proveedor" fileData={invoiceImage} setFileData={setInvoiceImage} colorTheme="blue" icon={FileText} />
                  <UploadCard title="Orden SAP" fileData={poImage} setFileData={setPoImage} colorTheme="green" icon={Search} />
                </div>

                <button
                  onClick={processImages}
                  disabled={isProcessing || !invoiceImage || !poImage || (!selectedMappingId && allMappings.length === 0)}
                  className="w-full bg-slate-900 hover:bg-blue-600 disabled:bg-slate-200 text-white py-5 rounded-3xl font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4"
                >
                  {isProcessing ? <><Loader2 className="animate-spin" /> Procesando Extracción Estricta...</> : <><CheckCircle2 size={24} /> Validar Ahora</>}
                </button>

                {error && (
                  <div className="bg-red-50 border-2 border-red-100 text-red-600 p-6 rounded-3xl mt-6 flex items-center gap-4">
                    <AlertCircle size={32} className="shrink-0" /> <p className="font-bold">{error}</p>
                  </div>
                )}
              </div>
            )}

            {results && (
              <div className="animate-in slide-in-from-bottom-4 duration-700">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-3xl font-black text-slate-900 leading-none">{results.length}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">OK Total</p>
                    <p className="text-3xl font-black text-green-600 leading-none">{results.filter(r => !r.tieneDiferencia).length}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-center border-orange-200 bg-orange-50/30">
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Dif. Cantidad</p>
                    <p className="text-3xl font-black text-orange-600 leading-none">{results.filter(r => r.tieneDifCant).length}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-center border-red-200 bg-red-50/30">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Dif. Precio</p>
                    <p className="text-3xl font-black text-red-600 leading-none">{results.filter(r => r.tieneDifPrecio).length}</p>
                  </div>
                </div>

                <div className="bg-white rounded-[3rem] border shadow-xl overflow-hidden mb-20">
                  <div className="p-6 md:p-8 border-b bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h2 className="text-xl md:text-2xl font-black">Detalle de Comparación</h2>
                    <button onClick={() => exportCSV(results)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-md transition-all text-sm">
                      <Download size={18} /> <span className="hidden sm:inline">Exportar Excel</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-5">Cod. SAP</th>
                          <th className="px-6 py-5">Producto (OC / Factura)</th>
                          <th className="px-6 py-5 text-center bg-slate-100/50">Cant. Fact</th>
                          <th className="px-6 py-5 text-center bg-slate-100/50">Mult.</th>
                          <th className="px-6 py-5 text-center bg-slate-100/50">Total</th>
                          <th className="px-6 py-5 text-center bg-orange-50/50">Cant. OC</th>
                          <th className="px-6 py-5 text-center bg-orange-50/50">Dif. Cant</th>
                          <th className="px-6 py-5 text-right">P. Real</th>
                          <th className="px-6 py-5 text-right">P. OC</th>
                          <th className="px-6 py-5 text-right bg-red-50/30">Dif. Precio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map((row, i) => (
                          <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.tieneDiferencia ? 'bg-red-50/10' : ''}`}>
                            <td className="px-6 py-5 align-top">
                              <div className={`font-black text-sm ${row.sapSku === 'No Homologado' ? 'text-orange-600' : 'text-slate-900'}`}>{row.sapSku}</div>
                              <div className="text-[10px] text-slate-400">Prov: {row.codProducto}</div>
                            </td>
                            <td className="px-6 py-5 align-top max-w-[250px]">
                              <div className="text-[11px] font-black text-blue-800 truncate mb-1">OC: {row.nombreSap}</div>
                              <div className="text-xs text-slate-600 leading-tight">FAC: {row.descripcion}</div>
                            </td>
                            
                            <td className="px-6 py-5 text-center font-bold text-slate-500 align-middle bg-slate-50/30">{row.cantFacturaOriginal}</td>
                            <td className="px-6 py-5 text-center align-middle bg-slate-50/30">
                              {row.multiplicador > 1 ? (
                                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg text-[10px] font-black" title={row.metodoDeteccion}>
                                  <Zap size={12} /> x{row.multiplicador}
                                </span>
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-6 py-5 text-center font-black text-slate-900 align-middle bg-slate-50/30">{row.cantRealTotal}</td>
                            
                            <td className="px-6 py-5 text-center font-bold text-slate-600 align-middle border-l border-slate-100">{row.cantSAP}</td>
                            <td className="px-6 py-5 text-center font-black align-middle">
                              {row.diferenciaCantidad > 0 ? (
                                <span className="text-red-600 bg-red-100 px-2 py-1 rounded-md text-xs">+ {row.diferenciaCantidad} (Fact. de más)</span>
                              ) : row.diferenciaCantidad < 0 ? (
                                <span className="text-orange-500 bg-orange-100 px-2 py-1 rounded-md text-xs">{row.diferenciaCantidad} (Pendiente env.)</span>
                              ) : (
                                <span className="text-green-500"><CheckCircle2 size={16} className="mx-auto" /></span>
                              )}
                            </td>

                            <td className="px-6 py-5 text-right font-black align-middle border-l border-slate-100">
                              ${row.precioFacturaReal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td className="px-6 py-5 text-right text-slate-500 font-bold align-middle">
                              ${row.precioOC.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td className={`px-6 py-5 text-right font-black align-middle ${row.tieneDifPrecio ? 'text-red-600 bg-red-50/30' : 'text-green-600'}`}>
                              ${row.diferenciaPrecio.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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
            <h1 className="text-3xl font-black mb-8">Historial de Revisiones</h1>
            <div className="grid gap-4">
              {history.map(entry => (
                <div key={entry.id} className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between hover:border-blue-300 transition-colors gap-4">
                  <div>
                    <h4 className="font-black text-slate-800 uppercase text-lg">{entry.provider}</h4>
                    <p className="text-xs text-slate-400 font-medium">{entry.date}</p>
                  </div>
                  <div className="flex items-center gap-6 bg-slate-50 px-6 py-3 rounded-2xl border">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Items</p>
                      <p className="font-black text-slate-700">{entry.itemsCount}</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200"></div>
                    <div className="text-center">
                      <p className="text-[10px] font-black text-red-400 uppercase">Alertas</p>
                      <p className={`font-black ${entry.errorsCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{entry.errorsCount}</p>
                    </div>
                  </div>
                  <button onClick={() => { setResults(entry.data); setIsFormCollapsed(true); setActiveTab('compare'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-slate-900 transition-colors w-full md:w-auto">
                    Ver Reporte <ChevronRight size={18} />
                  </button>
                </div>
              ))}
              {history.length === 0 && (
                <div className="text-center py-20">
                  <History size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-400 font-medium">Aún no has procesado ninguna validación.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in slide-in-from-left-4 duration-500">
            <header className="mb-8">
              <h1 className="text-3xl font-black text-slate-900">Gestor de Homólogos en la Nube</h1>
              <p className="text-slate-500">Crea bases de datos de proveedores. Puedes compartirlas con todo el equipo o hacerlas privadas.</p>
            </header>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 md:p-10 rounded-[3rem] border shadow-xl">
                <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-slate-800">
                  <Plus className="text-blue-600" /> Crear Nueva Base
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase mb-2 block tracking-widest">Nombre de la Base (Ej: COLANTA NACIONAL):</label>
                    <input 
                      type="text" 
                      value={newBaseName}
                      onChange={(e) => setNewBaseName(e.target.value)}
                      placeholder="Identificador del proveedor..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-slate-400 uppercase block tracking-widest">Pega datos de Excel aquí:</label>
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-md">Orden: SKU SAP | Nombre SAP | SKU Prov | Nombre Prov</span>
                    </div>
                    <textarea 
                      rows={6}
                      value={pasteData}
                      onChange={(e) => setPasteData(e.target.value)}
                      placeholder="Copia las filas desde Excel y pégalas aquí directamente..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-mono text-sm outline-none focus:border-blue-500 transition-colors whitespace-pre"
                    ></textarea>
                  </div>

                  <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl">
                    <p className="text-xs font-black text-slate-600 uppercase mb-3">Visibilidad de la Base de Datos</p>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setIsPublicBase(true)}
                        className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all border-2 ${isPublicBase ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}
                      >
                        <Globe size={18} /> Pública (Empresa)
                      </button>
                      <button 
                        onClick={() => setIsPublicBase(false)}
                        className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all border-2 ${!isPublicBase ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                      >
                        <Lock size={18} /> Privada (Solo yo)
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleCreateMapping} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-blue-100 transition-all"
                  >
                    <Save size={20} /> Guardar Base en la Nube
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Globe size={14} /> Bases Compartidas (Empresa)
                  </h3>
                  {publicMappings.length === 0 ? <p className="text-xs text-slate-400 italic mb-4">No hay bases públicas aún.</p> : null}
                  {publicMappings.map(mapping => (
                    <div key={mapping.id} className="bg-white p-5 rounded-3xl border shadow-sm mb-3 flex items-start justify-between border-l-4 border-l-blue-500">
                      <div>
                        <h4 className="font-black text-slate-800">{mapping.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{mapping.items.length} Productos</p>
                      </div>
                      <button onClick={() => deleteMapping(mapping)} className="text-slate-300 hover:text-red-500 p-2">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 mt-8 flex items-center gap-2">
                    <Lock size={14} /> Tus Bases Privadas
                  </h3>
                  {privateMappings.length === 0 ? <p className="text-xs text-slate-400 italic">No tienes bases privadas.</p> : null}
                  {privateMappings.map(mapping => (
                    <div key={mapping.id} className="bg-white p-5 rounded-3xl border shadow-sm mb-3 flex items-start justify-between border-l-4 border-l-slate-800">
                      <div>
                        <h4 className="font-black text-slate-800">{mapping.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{mapping.items.length} Productos</p>
                      </div>
                      <button onClick={() => deleteMapping(mapping)} className="text-slate-300 hover:text-red-500 p-2">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}