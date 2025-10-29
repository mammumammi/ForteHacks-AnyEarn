"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { parseEther, formatEther } from "viem";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Routing from "./Routing";
import { useScaffoldWriteContract, useScaffoldReadContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";
import { usePublicClient } from "wagmi";

const createOrangeMarkerIcon = (name: string) => L.divIcon({
  className: 'custom-orange-marker',
  html: `<div style="position: relative;"><div style="background-color: #ff8c00; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div><div style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.8); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">${name}</div></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

type LatLng = [number, number];
interface Suggestion { place_name: string; center: [number, number]; }
interface ServiceRequest {
  id: string;
  serviceId?: bigint;
  serviceName: string;
  flowAmount: string;
  fromLocation: string;
  toLocation: string;
  fromCoordinates?: LatLng;
  toCoordinates?: LatLng;
  requester?: string;
  pendingAcceptor?: string;
  acceptedBy?: string;
  completed?: boolean;
  nftTokenId?: bigint;
}

const FlyToUserLocation = ({ userLocation }: { userLocation: LatLng }) => {
  const map = useMap();
  useEffect(() => { if (userLocation) map.flyTo(userLocation, 13); }, [userLocation, map]);
  return null;
};

const MapComponent = () => {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [flowAmount, setFlowAmount] = useState("");
  const [useCurrentLoc, setUseCurrentLoc] = useState(true);
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [fromSugg, setFromSugg] = useState<Suggestion[]>([]);
  const [toSugg, setToSugg] = useState<Suggestion[]>([]);
  const [services, setServices] = useState<ServiceRequest[]>([]);
  const [showList, setShowList] = useState(false);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "ServiceContract" });
  const publicClient = usePublicClient();
  const { data: contractData } = useScaffoldContract({ contractName: "ServiceContract" });
  
  const { data: allServiceIds } = useScaffoldReadContract({ 
    contractName: "ServiceContract", 
    functionName: "getAllServiceIds", // Changed back to getAllServiceIds since getActiveServiceIds might not exist
    watch: true 
  });

  // Use useMemo to stabilize TOKEN reference
  const TOKEN = useMemo(() => process.env.NEXT_PUBLIC_MAPBOX_API_KEY || "", []);

  // Convert BigInt array to string array for stable comparison
  const serviceIdsString = useMemo(() => {
    if (!allServiceIds || allServiceIds.length === 0) return "[]";
    // Convert BigInt to string before JSON.stringify
    return JSON.stringify(allServiceIds.map((id: bigint) => id.toString()));
  }, [allServiceIds]);
  
  // Stabilize userLocation to prevent unnecessary re-renders
  const stableUserLocation = useMemo(() => userLocation, [userLocation?.[0], userLocation?.[1]]);
  
  // Memoize fetchSuggestions to prevent recreation on every render
  const fetchSuggestions = useCallback(async (query: string, setter: (s: Suggestion[]) => void) => {
    if (query.length < 3) { setter([]); return; }
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${TOKEN}&autocomplete=true${stableUserLocation ? `&proximity=${stableUserLocation[1]},${stableUserLocation[0]}` : ""}`);
      const data = await res.json();
      setter(data.features || []);
    } catch { setter([]); }
  }, [TOKEN, stableUserLocation]);

  useEffect(() => {
    console.log("Checking geolocation support...");
    
    const getIPLocation = async () => {
      try {
        console.log("Attempting IP-based geolocation...");
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data.latitude && data.longitude) {
          console.log("✅ IP location obtained:", data.city, data.country);
          setUserLocation([data.latitude, data.longitude]);
          notification.success(`Location detected: ${data.city}, ${data.country}`);
          return true;
        }
      } catch (err) {
        console.error("IP location failed:", err);
      }
      return false;
    };
    
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported by this browser");
      notification.warning("GPS not available, trying IP-based location...");
      getIPLocation().then(success => {
        if (!success) {
          setUserLocation([40.7128, -74.0060]); // Default to NYC
          notification.info("Using default location (New York City)");
        }
      });
      return;
    }
    
    console.log("Requesting GPS position...");
    
    navigator.geolocation.getCurrentPosition(
      p => {
        console.log("✅ GPS location obtained successfully!");
        console.log("Latitude:", p.coords.latitude);
        console.log("Longitude:", p.coords.longitude);
        console.log("Accuracy:", p.coords.accuracy, "meters");
        setUserLocation([p.coords.latitude, p.coords.longitude]);
        notification.success("GPS location detected!");
      },
      async err => {
        console.error("❌ GPS error:");
        console.error("Error code:", err.code);
        console.error("Error message:", err.message);
        
        if (err.code === 1) {
          notification.warning("Location permission denied. Trying IP-based location...");
        } else if (err.code === 2) {
          notification.warning("GPS unavailable. Trying IP-based location...");
        } else if (err.code === 3) {
          notification.warning("GPS timeout. Trying IP-based location...");
        }
        
        // Try IP-based location as fallback
        const success = await getIPLocation();
        if (!success) {
          setUserLocation([40.7128, -74.0060]);
          notification.info("Using default location (New York City)");
        }
      },
      { 
        enableHighAccuracy: false, 
        timeout: 5000, 
        maximumAge: 600000 
      }
    );
  }, []);

  useEffect(() => { const t = setTimeout(() => fetchSuggestions(fromLoc, setFromSugg), 300); return () => clearTimeout(t); }, [fromLoc, fetchSuggestions]);
  useEffect(() => { const t = setTimeout(() => fetchSuggestions(toLoc, setToSugg), 300); return () => clearTimeout(t); }, [toLoc, fetchSuggestions]);

  useEffect(() => {
    // Prevent running if dependencies aren't ready
    if (!serviceIdsString || serviceIdsString === "[]") {
      setServices([]);
      return;
    }
    
    if (!contractData || !publicClient) {
      return;
    }

    let isCancelled = false;
    
    const fetchServices = async () => {
      // Parse string IDs and convert back to BigInt
      const stringIds: string[] = JSON.parse(serviceIdsString);
      const ids = stringIds.map(id => BigInt(id));
      
      try {
        const srvcs: ServiceRequest[] = [];
        for (const id of ids) {
          if (isCancelled) break; // Stop if component unmounted
          
          try {
            const s: any = await contractData.read.getService([id]);
            
            // Skip completed services
            if (s.completed) continue;
            
            const geocode = async (loc: string) => {
              if (!loc || loc === "Current Location") return undefined;
              try {
                const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(loc)}.json?access_token=${TOKEN}&limit=1`);
                const data = await res.json();
                if (data.features?.[0]) return [data.features[0].center[1], data.features[0].center[0]] as LatLng;
              } catch {}
              return undefined;
            };
            
            srvcs.push({
              id: id.toString(),
              serviceId: id,
              serviceName: s.title,
              flowAmount: formatEther(s.flowAmount),
              fromLocation: s.startLocation,
              toLocation: s.endLocation,
              fromCoordinates: await geocode(s.startLocation),
              toCoordinates: await geocode(s.endLocation),
              requester: s.requester,
              acceptedBy: s.acceptedBy !== "0x0000000000000000000000000000000000000000" ? s.acceptedBy : undefined,
              completed: s.completed,
              nftTokenId: s.nftTokenId || undefined,
            });
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (err) {
            console.error(`Error fetching service ${id}:`, err);
          }
        }
        
        if (!isCancelled) {
          setServices(srvcs);
        }
      } catch (err) {
        console.error("Error fetching services:", err);
      }
    };
    
    fetchServices();
    
    return () => {
      isCancelled = true;
    };
  }, [serviceIdsString, TOKEN]);

  const handleSubmit = async () => {
    if (!address || !serviceName || !toLoc) { notification.error("Fill all fields"); return; }
    const startLoc = useCurrentLoc ? "Current Location" : fromLoc;
    if (!startLoc.trim()) { notification.error("Specify start location"); return; }
    try {
      const amt = parseEther(flowAmount || "0");
      if (amt === 0n) { notification.error("Flow amount > 0"); return; }
      setLoading(true);
      await writeContractAsync({ functionName: "createService", args: [serviceName, startLoc, toLoc], value: amt }, {
        onBlockConfirmation: () => {
          notification.success("Service created!");
          setServiceName(""); setFlowAmount(""); setFromLoc(""); setToLoc(""); setShowForm(false);
        }
      });
    } catch (e: any) {
      notification.error(e?.message || "Failed");
    } finally { setLoading(false); }
  };

  const handleAccept = async (srv: ServiceRequest) => {
    if (!srv.serviceId) {
      notification.error("Invalid service ID");
      return;
    }
    
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    console.log("=== ACCEPTING SERVICE ===");
    console.log("Service ID:", srv.serviceId.toString());
    console.log("Service Amount:", srv.flowAmount, "ETH");
    console.log("User Address:", address);

    try {
      setLoading(true);
      notification.info("Preparing transaction... Please wait");
      
      console.log("Calling acceptService with serviceId:", srv.serviceId);
      
      const tx = await writeContractAsync({ 
        functionName: "requestServiceAcceptance", 
        args: [srv.serviceId] 
      }, {
        onBlockConfirmation: (txnReceipt: any) => {
          console.log("✅ Transaction confirmed:", txnReceipt);
          notification.success("🎉 Service accepted! NFT minted successfully!");
          
          // Refresh service list to show NFT token ID
          setSelected(srv);
          
          // Setup routing
          if (srv.fromCoordinates && srv.toCoordinates) {
            setRouteStart(srv.fromCoordinates);
            setDestination(srv.toCoordinates);
            notification.info("Route displayed: Start → End location");
          } else if (srv.toCoordinates && userLocation) {
            setRouteStart(userLocation);
            setDestination(srv.toCoordinates);
            notification.info("Route displayed: Your location → End location");
          }
        }
      });
      
      console.log("Transaction sent:", tx);
      notification.info("Transaction sent! Waiting for confirmation...");
      
    } catch (e: any) {
      console.error("❌ Accept service error:", e);
      
      // Detailed error handling
      if (e?.message?.includes("User rejected") || e?.message?.includes("user rejected")) {
        notification.warning("Transaction cancelled by user");
      } else if (e?.message?.includes("insufficient funds")) {
        notification.error("Insufficient funds for transaction");
      } else if (e?.message?.includes("429") || e?.message?.includes("rate limit")) {
        notification.error("Rate limit reached. Please wait and try again.");
      } else if (e?.shortMessage) {
        notification.error(`Error: ${e.shortMessage}`);
      } else if (e?.message) {
        notification.error(`Error: ${e.message.substring(0, 100)}`);
      } else {
        notification.error("Failed to accept service. Check console for details.");
      }
    } finally { 
      setLoading(false); 
    }
  };

  const handleComplete = async (srv: ServiceRequest) => {
    if (!srv.serviceId) {
      notification.error("Invalid service ID");
      return;
    }
    
    if (!srv.nftTokenId) {
      notification.error("No NFT associated with this service");
      return;
    }

    console.log("=== COMPLETING SERVICE ===");
    console.log("Service ID:", srv.serviceId.toString());
    console.log("NFT Token ID:", srv.nftTokenId.toString());

    try {
      setLoading(true);
      notification.info("Completing service and burning NFT...");
      
      await writeContractAsync({ 
        functionName: "completeService", 
        args: [srv.serviceId] 
      }, {
        onBlockConfirmation: (txnReceipt: any) => {
          console.log("✅ Service completed:", txnReceipt);
          notification.success("🎉 Service completed! NFT burned and funds released!");
          setSelected(null); 
          setRouteStart(null); 
          setDestination(null);
        }
      });
    } catch (e: any) {
      console.error("❌ Complete service error:", e);
      if (e?.shortMessage) {
        notification.error(`Error: ${e.shortMessage}`);
      } else {
        notification.error(e?.message || "Failed to complete service");
      }
    } finally { 
      setLoading(false); 
    }
  };

  if (!TOKEN || TOKEN === "your_mapbox_api_key_here") return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Set NEXT_PUBLIC_MAPBOX_API_KEY in .env.local</div>;
  if (!userLocation) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading map...</div>;

  // Debug info
  console.log("=== MAP COMPONENT STATE ===");
  console.log("User Address:", address);
  console.log("Services Count:", services.length);
  console.log("Contract Data:", contractData ? "Loaded" : "Not Loaded");
  console.log("Is Mining:", isMining);
  console.log("Loading:", loading);

  return (
    <div className="relative w-full h-screen">
      {/* Wallet Connection Header */}
      <div className="absolute top-0 left-0 right-0 z-[1001] bg-gray-900 border-b border-gray-700 px-6 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-white font-bold text-xl">🗺️ Service Marketplace</h1>
            {address && (
              <div className="text-xs text-gray-400">
                Connected: {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {address ? (
              <>
                <div className="px-3 py-2 bg-green-900 border border-green-600 rounded-lg">
                  <p className="text-green-400 text-xs font-medium">✓ Connected</p>
                </div>
                <button
                  onClick={() => {
                    disconnect();
                    notification.success("Wallet disconnected");
                  }}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg"
                >
                  🔌 Disconnect Wallet
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="px-3 py-2 bg-red-900 border border-red-600 rounded-lg">
                  <p className="text-red-400 text-xs font-medium">⚠️ Not Connected</p>
                </div>
                <ConnectButton />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="absolute top-16 left-4 z-[1000] w-96">
        {!showForm ? (
          <div className="space-y-2">
            <button onClick={() => setShowForm(true)} className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700">🚀 Create Service</button>
            <button onClick={() => setShowList(!showList)} className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg shadow-lg hover:bg-purple-700">📋 Services ({services.length})</button>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-4">
            <div className="flex justify-between mb-4"><h3 className="text-white font-medium">Create Service</h3><button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">✕</button></div>
            <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Service name" className="w-full mb-3 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />
            <input type="number" value={flowAmount} onChange={e => setFlowAmount(e.target.value)} placeholder="Flow amount" className="w-full mb-3 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />
            <div className="mb-3"><label className="flex items-center gap-2 text-gray-300 text-sm"><input type="checkbox" checked={useCurrentLoc} onChange={e => setUseCurrentLoc(e.target.checked)} /> Use current location</label></div>
            {!useCurrentLoc && <div className="relative mb-3"><input value={fromLoc} onChange={e => setFromLoc(e.target.value)} placeholder="From" className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />{fromSugg.length > 0 && <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto z-10">{fromSugg.map((s, i) => <li key={i} onClick={() => { setFromLoc(s.place_name); setFromSugg([]); }} className="px-3 py-2 cursor-pointer text-white hover:bg-gray-600">{s.place_name}</li>)}</ul>}</div>}
            <div className="relative mb-4"><input value={toLoc} onChange={e => setToLoc(e.target.value)} placeholder="To" className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />{toSugg.length > 0 && <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto z-10">{toSugg.map((s, i) => <li key={i} onClick={() => { setToLoc(s.place_name); setToSugg([]); }} className="px-3 py-2 cursor-pointer text-white hover:bg-gray-600">{s.place_name}</li>)}</ul>}</div>
            <button onClick={handleSubmit} disabled={loading} className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600">Submit</button>
          </div>
        )}
      </div>

      {showList && (
        <div className="absolute top-44 left-4 z-[1000] w-96 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto">
          <div className="flex justify-between mb-4"><h3 className="text-white font-medium">Services ({services.length})</h3><button onClick={() => setShowList(false)} className="text-gray-400 hover:text-white">✕</button></div>
          {services.length === 0 ? <p className="text-gray-400 text-sm">No services</p> : services.map(s => (
            <div key={s.id} className="bg-gray-700 p-3 rounded mb-3 border border-gray-600">
              <h4 className="text-white font-medium text-sm">{s.serviceName}</h4>
              <p className="text-gray-300 text-xs">💰 {s.flowAmount} Flow</p>
              <p className="text-gray-300 text-xs">📍 {s.fromLocation} → {s.toLocation}</p>
              {s.nftTokenId && <p className="text-purple-400 text-xs">🎨 NFT #{s.nftTokenId.toString()} (Escrow Active)</p>}
              
              {/* Show Route Button */}
              {(s.fromCoordinates || s.toCoordinates) && (
                <button 
                  onClick={() => {
                    setSelected(s);
                    if (s.fromCoordinates && s.toCoordinates) {
                      setRouteStart(s.fromCoordinates);
                      setDestination(s.toCoordinates);
                      notification.info("Route displayed on map");
                    } else if (s.toCoordinates && userLocation) {
                      setRouteStart(userLocation);
                      setDestination(s.toCoordinates);
                      notification.info("Route displayed on map");
                    }
                  }}
                  className="mt-2 w-full px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                >
                  🗺️ Show Route
                </button>
              )}
              
              {s.acceptedBy ? (
                <div className="mt-2">
                  <p className="text-green-500 text-xs">✓ Accepted by {s.acceptedBy.slice(0, 6)}...{s.acceptedBy.slice(-4)}</p>
                  {s.requester === address && (
                    <button 
                      onClick={() => handleComplete(s)} 
                      disabled={loading || isMining} 
                      className="mt-2 w-full px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading || isMining ? "Processing..." : "✅ Complete & Burn NFT"}
                    </button>
                  )}
                </div>
              ) : (
                <button 
                  onClick={() => handleAccept(s)} 
                  disabled={loading || isMining || s.requester === address} 
                  className="mt-2 w-full px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loading || isMining ? "Processing..." : "Accept & Mint NFT"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <MapContainer center={userLocation} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${TOKEN}`} />
        <Marker position={userLocation}><Popup>You are here</Popup></Marker>
        {destination && <Marker position={destination}><Popup>Destination</Popup></Marker>}
        {services.map(s => {
          const markers = [];
          if (s.fromCoordinates) markers.push(<Marker key={`${s.id}-from`} position={s.fromCoordinates} icon={createOrangeMarkerIcon(s.serviceName)}><Popup><div className="text-sm"><h4 className="font-medium">{s.serviceName}</h4><p>💰 {s.flowAmount} Flow</p><p>{s.fromLocation} → {s.toLocation}</p></div></Popup></Marker>);
          if (s.toCoordinates) markers.push(<Marker key={`${s.id}-to`} position={s.toCoordinates} icon={createOrangeMarkerIcon(`${s.serviceName} (End)`)}><Popup><div className="text-sm"><h4>{s.serviceName} - End</h4></div></Popup></Marker>);
          return markers;
        })}
        {routeStart && destination && (
          <>
            {console.log("Rendering Routing component with:", { routeStart, destination, token: TOKEN ? "Present" : "Missing" })}
            <Routing userLocation={routeStart} destination={destination} token={TOKEN} />
          </>
        )}
        <FlyToUserLocation userLocation={userLocation} />
      </MapContainer>
      
      {/* Clear Route Button */}
      {(routeStart || destination) && (
        <button
          onClick={() => {
            console.log("Clearing route...");
            setRouteStart(null);
            setDestination(null);
            setSelected(null);
            notification.info("Route cleared");
          }}
          className="absolute bottom-4 left-4 z-[1000] px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700"
        >
          🗑️ Clear Route
        </button>
      )}
    </div>
  );
};

export default MapComponent;