import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { captureFullScreenshot } from '../utils/captureFrame';

export const useInspectionHistory = ({ videoRef, canvasRef }) => {
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!data) return;

      setHistory(data.map((item) => ({
        id: item.id,
        code: item.barcode,
        timestamp: new Date(item.created_at).toLocaleString(),
        status: item.status,
        image: item.image_url,
        details: Array.isArray(item.details)
          ? item.details.map((d) => `${d.name}: ${d.status === 'ok' ? 'OK' : 'FALHA'}`).join(', ')
          : 'Detalhes indisponíveis',
      })));
    };
    fetchHistory();
  }, []);

  const saveToHistory = async ({ currentBarcode, selectedModel, regions, setCurrentBarcode }) => {
    const allOk = regions.every((r) => r.status === 'ok');
    const snapshot = videoRef.current && canvasRef.current
      ? captureFullScreenshot(videoRef.current, regions)
      : null;

    const newInspection = {
      barcode: currentBarcode,
      model_name: selectedModel,
      status: allOk ? 'APROVADO' : 'REPROVADO',
      image_url: snapshot,
      details: regions.map((r) => ({
        name: r.name,
        status: r.status,
        confidence: r.confidence,
      })),
    };

    await supabase.from('inspections').insert([newInspection]);

    setHistory((prev) => [{
      id: Date.now(),
      code: currentBarcode,
      timestamp: new Date().toLocaleString(),
      status: allOk ? 'APROVADO' : 'REPROVADO',
      image: snapshot,
      details: regions.map((r) => `${r.name}: ${r.status === 'ok' ? 'OK' : 'FALHA'}`).join(', '),
    }, ...prev]);

    setCurrentBarcode('');
  };

  return { history, setHistory, showHistory, setShowHistory, saveToHistory };
};
