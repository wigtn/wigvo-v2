"use client";

import { useEffect, useState, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    naver: any;
  }
}

export default function TestMapPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [mapStatus, setMapStatus] = useState<string>("loading");
  const mapRef = useRef<any>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setLogs((prev) => [...prev, msg]);
  };

  useEffect(() => {
    addLog("1. Page mounted");
    addLog(`2. Current URL: ${window.location.href}`);
    addLog(`3. Client ID from env: ${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "NOT SET"}`);
  }, []);

  const handleScriptLoad = () => {
    addLog("4. Script loaded!");
    addLog(`5. window.naver exists: ${typeof window.naver !== "undefined"}`);
    addLog(`6. window.naver.maps exists: ${typeof window.naver?.maps !== "undefined"}`);

    if (window.naver?.maps) {
      addLog("7. Initializing map...");
      try {
        const mapDiv = document.getElementById("test-map");
        if (!mapDiv) {
          addLog("ERROR: Map div not found");
          return;
        }

        addLog("7.1. Map div found, creating map...");
        
        const mapOptions = {
          center: new window.naver.maps.LatLng(37.5665, 126.978),
          zoom: 15,
          mapTypeId: window.naver.maps.MapTypeId.NORMAL,
        };
        
        addLog(`7.2. Map options: ${JSON.stringify({lat: 37.5665, lng: 126.978, zoom: 15})}`);

        const map = new window.naver.maps.Map(mapDiv, mapOptions);
        mapRef.current = map;

        addLog("8. Map object created!");
        addLog(`8.1. Map instance: ${map ? "exists" : "null"}`);

        // Listen for map events
        window.naver.maps.Event.addListener(map, "init", () => {
          addLog("EVENT: Map initialized!");
        });

        window.naver.maps.Event.addListener(map, "error", (e: any) => {
          addLog(`EVENT ERROR: ${JSON.stringify(e)}`);
        });

        // Check auth status after delay
        setTimeout(() => {
          const mapContent = mapDiv.innerHTML;
          addLog(`9. Checking map content (length: ${mapContent.length})`);
          
          if (mapContent.includes("auth_fail")) {
            addLog("9.1. ❌ AUTH FAILED - found auth_fail in content");
            setMapStatus("auth_fail");
          } else if (mapContent.includes("img") && mapContent.includes("map.naver")) {
            addLog("9.1. ✅ Map tiles loading!");
            setMapStatus("success");
          } else {
            addLog("9.1. ⚠️ Unknown - content preview:");
            addLog(mapContent.substring(0, 500));
            setMapStatus("unknown");
          }

          // Check map bounds
          if (mapRef.current) {
            try {
              const center = mapRef.current.getCenter();
              const zoom = mapRef.current.getZoom();
              addLog(`10. Map state - Center: ${center?.lat()}, ${center?.lng()}, Zoom: ${zoom}`);
            } catch (e: any) {
              addLog(`10. Error getting map state: ${e.message}`);
            }
          }
        }, 3000);
      } catch (e: any) {
        addLog(`ERROR: ${e.message}`);
        addLog(`ERROR Stack: ${e.stack}`);
        setMapStatus("error");
      }
    }
  };

  const handleScriptError = () => {
    addLog("4. ❌ Script failed to load!");
    setMapStatus("script_error");
  };

  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Naver Map Test Page</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <p><strong>Client ID:</strong> <code>{clientId || "NOT SET"}</code></p>
        <p><strong>Status:</strong> {mapStatus}</p>
      </div>

      <div 
        id="test-map" 
        className="w-full h-[400px] border border-gray-300 rounded mb-4"
      />

      <div className="p-4 bg-black text-green-400 rounded font-mono text-sm h-[400px] overflow-y-scroll">
        <p className="text-white mb-2">Console Log:</p>
        {logs.map((log, i) => (
          <p key={i} className="break-all">{log}</p>
        ))}
      </div>
      
      <button 
        onClick={() => navigator.clipboard.writeText(logs.join('\n'))}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Copy All Logs
      </button>

      {clientId && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`}
          onLoad={handleScriptLoad}
          onError={handleScriptError}
        />
      )}
    </div>
  );
}
