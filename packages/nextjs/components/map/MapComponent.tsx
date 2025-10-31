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
import { ImageUpload } from "../ImageUpload";
import { MediaRenderer } from "thirdweb/react";

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
  imageIpfsHash?: string;
  completionImageHash?: string;
  completionSubmitted?: boolean;
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
  const [imageIpfsHash, setImageIpfsHash] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [completionImageHash, setCompletionImageHash] = useState<string>("");
  const [completionImageUrl, setCompletionImageUrl] = useState<string>("");
  const [showCompletionUpload, setShowCompletionUpload] = useState<string | null>(null);
  
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "ServiceContract" });
  const publicClient = usePublicClient();
  const { data: contractData } = useScaffoldContract({ contractName: "ServiceContract" });

  const handleImageUpload = useCallback((ipfsHash: string, url: string) => {
    setImageIpfsHash(ipfsHash);
    setImageUrl(url);
    console.log("Image uploaded - IPFS Hash:", ipfsHash, "URL:", url);
  }, []);
  
  const handleCompletionImageUpload = useCallback((ipfsHash: string, url: string) => {
    setCompletionImageHash(ipfsHash);
    setCompletionImageUrl(url);
    console.log("Completion Image uploaded - IPFS Hash:", ipfsHash, "URL:", url);
  }, []);
  
  const { data: allServiceIds } = useScaffoldReadContract({ 
    contractName: "ServiceContract", 
    functionName: "getAllServiceIds",
    watch: true 
  });

  const TOKEN = useMemo(() => process.env.NEXT_PUBLIC_MAPBOX_API_KEY || "", []);

  const serviceIdsString = useMemo(() => {
    if (!allServiceIds || allServiceIds.length === 0) return "[]";
    return JSON.stringify(allServiceIds.map((id: bigint) => id.toString()));
  }, [allServiceIds]);
  
  const stableUserLocation = useMemo(() => userLocation, [userLocation?.[0], userLocation?.[1]]);
  
  const fetchSuggestions = useCallback(async (query: string, setter: (s: Suggestion[]) => void) => {
    if (query.length < 3) { setter([]); return; }
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${TOKEN}&autocomplete=true${stableUserLocation ? `&proximity=${stableUserLocation[1]},${stableUserLocation[0]}` : ""}`);
      const data = await res.json();
      setter(data.features || []);
    } catch { setter([]); }
  }, [TOKEN, stableUserLocation]);

  useEffect(() => {
    const getIPLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data.latitude && data.longitude) {
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
      notification.warning("GPS not available, trying IP-based location...");
      getIPLocation().then(success => {
        if (!success) {
          setUserLocation([40.7128, -74.0060]);
          notification.info("Using default location (New York City)");
        }
      });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      p => {
        setUserLocation([p.coords.latitude, p.coords.longitude]);
        notification.success("GPS location detected!");
      },
      async err => {
        const success = await getIPLocation();
        if (!success) {
          setUserLocation([40.7128, -74.0060]);
          notification.info("Using default location (New York City)");
        }
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
    );
  }, []);

  useEffect(() => { const t = setTimeout(() => fetchSuggestions(fromLoc, setFromSugg), 300); return () => clearTimeout(t); }, [fromLoc, fetchSuggestions]);
  useEffect(() => { const t = setTimeout(() => fetchSuggestions(toLoc, setToSugg), 300); return () => clearTimeout(t); }, [toLoc, fetchSuggestions]);

  useEffect(() => {
    if (!serviceIdsString || serviceIdsString === "[]") {
      setServices([]);
      return;
    }
    
    if (!contractData || !publicClient) return;

    let isCancelled = false;
    
    const fetchServices = async () => {
      const stringIds: string[] = JSON.parse(serviceIdsString);
      const ids = stringIds.map(id => BigInt(id));
      
      try {
        const srvcs: ServiceRequest[] = [];
        for (const id of ids) {
          if (isCancelled) break;
          
          try {
            const s: any = await contractData.read.getService([id]);
            
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
            
            // CRITICAL FIX: Read pendingAcceptor from contract
            const pendingAddr = s.pendingAcceptor !== "0x0000000000000000000000000000000000000000" ? s.pendingAcceptor : undefined;
            const acceptedAddr = s.acceptedBy !== "0x0000000000000000000000000000000000000000" ? s.acceptedBy : undefined;
            
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
              pendingAcceptor: pendingAddr,
              acceptedBy: acceptedAddr,
              completed: s.completed,
              nftTokenId: s.nftTokenId || undefined,
              imageIpfsHash: s.imageIpfsHash || undefined,
              completionImageHash: s.completionImageHash || undefined,
              completionSubmitted: s.completionSubmitted || false, 
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
  }, [serviceIdsString, TOKEN, contractData, publicClient]);

  const handleSubmit = async () => {
    if (!address || !serviceName || !toLoc) { notification.error("Fill all fields"); return; }

    if (!imageIpfsHash || !imageUrl) {
      notification.error("Please upload a service image");
      return;
    }

    const startLoc = useCurrentLoc ? "Current Location" : fromLoc;
    if (!startLoc.trim()) { notification.error("Specify start location"); return; }
    try {
      const amt = parseEther(flowAmount || "0");
      if (amt === 0n) { notification.error("Flow amount > 0"); return; }
      setLoading(true);
      await writeContractAsync({ functionName: "createService", args: [serviceName, startLoc, toLoc, imageIpfsHash], value: amt }, {
        onBlockConfirmation: () => {
          notification.success("Service created!");
          setServiceName(""); 
          setFlowAmount(""); 
          setFromLoc(""); 
          setToLoc(""); 
          setShowForm(false);
          setImageIpfsHash("");
          setImageUrl("");
        }
      });
    } catch (e: any) {
      notification.error(e?.message || "Failed");
    } finally { setLoading(false); }
  };

  const handleSubmitCompletionImage = async (serviceId: string) => {
    if (!completionImageHash) {
      notification.error("Please upload completion image first");
      return;
    }
  
    try {
      setLoading(true);
      await writeContractAsync(
        {
          functionName: "submitCompletionImage",
          args: [BigInt(serviceId), completionImageHash],
        },
        {
          onBlockConfirmation: () => {
            notification.success("Completion image submitted! Waiting for requester verification.");
            setCompletionImageHash("");
            setCompletionImageUrl("");
            setShowCompletionUpload(null);
          },
        },
      );
    } catch (e: any) {
      notification.error(e?.message || "Failed to submit completion image");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndComplete = async (serviceId: string) => {
    try {
      setLoading(true);
      await writeContractAsync(
        {
          functionName: "completeService",
          args: [BigInt(serviceId)],
        },
        {
          onBlockConfirmation: () => {
            notification.success("Service verified and completed! Payment released.");
          },
        },
      );
    } catch (e: any) {
      notification.error(e?.message || "Failed to complete service");
    } finally {
      setLoading(false);
    }
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

    try {
      setLoading(true);
      notification.info("Requesting service acceptance...");
      
      await writeContractAsync({ 
        functionName: "requestServiceAcceptance", 
        args: [srv.serviceId] 
      }, {
        onBlockConfirmation: () => {
          notification.success("🎉 Service acceptance requested! Waiting for requester approval...");
          
          if (srv.fromCoordinates && srv.toCoordinates) {
            setRouteStart(srv.fromCoordinates);
            setDestination(srv.toCoordinates);
          } else if (srv.toCoordinates && userLocation) {
            setRouteStart(userLocation);
            setDestination(srv.toCoordinates);
          }
        }
      });
      
    } catch (e: any) {
      if (e?.message?.includes("User rejected") || e?.message?.includes("user rejected")) {
        notification.warning("Transaction cancelled by user");
      } else if (e?.shortMessage) {
        notification.error(`Error: ${e.shortMessage}`);
      } else {
        notification.error(e?.message || "Failed to request acceptance");
      }
    } finally { 
      setLoading(false); 
    }
  };

  const handleApproveAcceptance = async (srv: ServiceRequest) => {
    if (!srv.serviceId) {
      notification.error("Invalid service ID");
      return;
    }

    try {
      setLoading(true);
      notification.info("Approving service acceptance and minting NFT...");
      
      await writeContractAsync({ 
        functionName: "approveServiceAcceptance", 
        args: [srv.serviceId] 
      }, {
        onBlockConfirmation: () => {
          notification.success("✅ Service accepted! NFT minted and funds in escrow!");
        }
      });
      
    } catch (e: any) {
      notification.error(e?.shortMessage || e?.message || "Failed to approve acceptance");
    } finally { 
      setLoading(false); 
    }
  };

  if (!TOKEN || TOKEN === "your_mapbox_api_key_here") return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Set NEXT_PUBLIC_MAPBOX_API_KEY in .env.local</div>;
  if (!userLocation) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading map...</div>;

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
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-medium">Create Service</h3><button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">✕</button></div>
            
            <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Service name" className="w-full mb-3 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />
            <input type="number" step="0.001" value={flowAmount} onChange={e => setFlowAmount(e.target.value)} placeholder="Flow amount (ETH)" className="w-full mb-3 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />
            
            <ImageUpload 
              onImageUploaded={handleImageUpload}
              currentImage={imageUrl}
            />

            <div className="mb-3 mt-3"><label className="flex items-center gap-2 text-gray-300 text-sm"><input type="checkbox" checked={useCurrentLoc} onChange={e => setUseCurrentLoc(e.target.checked)} /> Use current location</label></div>
            {!useCurrentLoc && <div className="relative mb-3"><input value={fromLoc} onChange={e => setFromLoc(e.target.value)} placeholder="From location" className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />{fromSugg.length > 0 && <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto z-10">{fromSugg.map((s, i) => <li key={i} onClick={() => { setFromLoc(s.place_name); setFromSugg([]); }} className="px-3 py-2 cursor-pointer text-white hover:bg-gray-600">{s.place_name}</li>)}</ul>}</div>}
            <div className="relative mb-4"><input value={toLoc} onChange={e => setToLoc(e.target.value)} placeholder="To location" className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded" />{toSugg.length > 0 && <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto z-10">{toSugg.map((s, i) => <li key={i} onClick={() => { setToLoc(s.place_name); setToSugg([]); }} className="px-3 py-2 cursor-pointer text-white hover:bg-gray-600">{s.place_name}</li>)}</ul>}</div>
            <button onClick={handleSubmit} disabled={loading || !imageIpfsHash} className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
              {loading ? "Creating..." : "Create Service Request"}
            </button>
          </div>
        )}
      </div>

      {showList && (
        <div className="absolute top-44 left-4 z-[1000] w-96 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-4 max-h-[70vh] overflow-y-auto">
          <div className="flex justify-between mb-4">
            <h3 className="text-white font-medium">Active Services ({services.length})</h3>
            <button onClick={() => setShowList(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          {services.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No active services</p>
          ) : (
            services.map(s => (
              <div key={s.id} className="bg-gray-700 p-3 rounded mb-3 border border-gray-600">
                <h4 className="text-white font-medium text-sm mb-2">{s.serviceName}</h4>
                
                {/* Service Request Image */}
                {s.imageIpfsHash && (
                  <div className="my-2">
                    <img 
                      src={`https://ipfs.io/ipfs/${s.imageIpfsHash}`}
                      alt="Service request"
                      className="w-full h-32 object-cover rounded border border-gray-500"
                      loading="lazy"
                      onError={(e) => {
                        // Try alternative gateways if first fails
                        const currentSrc = e.currentTarget.src;
                        if (currentSrc.includes('ipfs.io')) {
                          e.currentTarget.src = `https://gateway.pinata.cloud/ipfs/${s.imageIpfsHash}`;
                        } else if (currentSrc.includes('pinata')) {
                          e.currentTarget.src = `https://cloudflare-ipfs.com/ipfs/${s.imageIpfsHash}`;
                        } else if (currentSrc.includes('cloudflare')) {
                          e.currentTarget.src = `https://ipfs.thirdwebcdn.com/ipfs/${s.imageIpfsHash}`;
                        } else {
                          // Final fallback to placeholder
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%239CA3AF' font-family='sans-serif' font-size='10' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage Unavailable%3C/text%3E%3C/svg%3E";
                        }
                      }}
                    />
                    <p className="text-xs text-gray-400 mt-1">📸 Service Request Photo</p>
                    <a 
                      href={`https://ipfs.io/ipfs/${s.imageIpfsHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      View on IPFS
                    </a>
                  </div>
                )}
                
                <div className="space-y-1 mb-2">
                  <p className="text-gray-300 text-xs">💰 {s.flowAmount} ETH</p>
                  <p className="text-gray-300 text-xs">📍 {s.fromLocation} → {s.toLocation}</p>
                  <p className="text-gray-400 text-xs">👤 Requester: {s.requester?.slice(0, 6)}...{s.requester?.slice(-4)}</p>
                  {s.nftTokenId && (
                    <p className="text-purple-400 text-xs font-medium">🎨 NFT #{s.nftTokenId.toString()} (Escrow Active)</p>
                  )}
                </div>
                
                {/* Show Route Button */}
                {(s.fromCoordinates || s.toCoordinates) && (
                  <button 
                    onClick={() => {
                      setSelected(s);
                      if (s.fromCoordinates && s.toCoordinates) {
                        setRouteStart(s.fromCoordinates);
                        setDestination(s.toCoordinates);
                      } else if (s.toCoordinates && userLocation) {
                        setRouteStart(userLocation);
                        setDestination(s.toCoordinates);
                      }
                      notification.info("📍 Route displayed on map");
                    }}
                    className="mt-2 w-full px-3 py-2 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 font-medium"
                  >
                    🗺️ Show Route on Map
                  </button>
                )}
                
                {/* REQUESTER: Approve pending acceptance */}
                {s.requester === address && s.pendingAcceptor && !s.acceptedBy && (
                  <div className="mt-2 bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded p-3">
                    <p className="text-xs text-yellow-200 mb-2 font-medium">
                      ⏳ Acceptance requested by:
                    </p>
                    <p className="text-xs text-yellow-100 mb-2 font-mono">
                      {s.pendingAcceptor.slice(0, 10)}...{s.pendingAcceptor.slice(-8)}
                    </p>
                    <button
                      onClick={() => handleApproveAcceptance(s)}
                      disabled={loading || isMining}
                      className="w-full px-3 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {loading || isMining ? "Processing..." : "✅ Approve & Mint NFT"}
                    </button>
                  </div>
                )}
                
                {/* SERVICE PROVIDER: Upload completion photo */}
                {s.acceptedBy === address && !s.completionSubmitted && !s.completed && (
                  <div className="mt-2">
                    {showCompletionUpload === s.id ? (
                      <div className="bg-gray-800 p-3 rounded border border-blue-500">
                        <p className="text-sm text-white mb-2 font-medium">📸 Upload Completion Proof:</p>
                        <ImageUpload 
                          onImageUploaded={handleCompletionImageUpload}
                          currentImage={completionImageUrl}
                        />
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleSubmitCompletionImage(s.id)}
                            disabled={!completionImageHash || loading || isMining}
                            className="flex-1 px-3 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-medium"
                          >
                            {loading || isMining ? "Submitting..." : "✓ Submit Proof"}
                          </button>
                          <button
                            onClick={() => {
                              setShowCompletionUpload(null);
                              setCompletionImageHash("");
                              setCompletionImageUrl("");
                            }}
                            className="px-3 py-2 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCompletionUpload(s.id)}
                        className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-medium"
                      >
                        📸 Upload Completion Photo
                      </button>
                    )}
                  </div>
                )}
                
                {/* Waiting for verification status */}
                {s.acceptedBy === address && s.completionSubmitted && !s.completed && (
                  <div className="mt-2 p-2 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded">
                    <p className="text-xs text-yellow-300 text-center">⏳ Waiting for requester to verify completion</p>
                  </div>
                )}
                
                {/* REQUESTER: Verify completion and release payment */}
                {s.requester === address && s.completionSubmitted && !s.completed && s.completionImageHash && (
                  <div className="mt-2 bg-green-900 bg-opacity-30 p-3 rounded border-2 border-green-600">
                    <p className="text-sm text-white mb-2 font-medium">✅ Completion Proof Received!</p>
                    <img 
                      src={`https://ipfs.io/ipfs/${s.completionImageHash}`}
                      alt="Completion proof"
                      className="w-full h-32 object-cover rounded mb-3 border border-green-500"
                      loading="lazy"
                      onError={(e) => {
                        // Try alternative gateways if first fails
                        const currentSrc = e.currentTarget.src;
                        if (currentSrc.includes('ipfs.io')) {
                          e.currentTarget.src = `https://gateway.pinata.cloud/ipfs/${s.completionImageHash}`;
                        } else if (currentSrc.includes('pinata')) {
                          e.currentTarget.src = `https://cloudflare-ipfs.com/ipfs/${s.completionImageHash}`;
                        } else if (currentSrc.includes('cloudflare')) {
                          e.currentTarget.src = `https://ipfs.thirdwebcdn.com/ipfs/${s.completionImageHash}`;
                        } else {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%239CA3AF' font-family='sans-serif' font-size='10' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage Unavailable%3C/text%3E%3C/svg%3E";
                        }
                      }}
                    />
                    <a 
                      href={`https://ipfs.io/ipfs/${s.completionImageHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-300 hover:text-green-200 underline block mb-3"
                    >
                      View full image on IPFS
                    </a>
                    <button
                      onClick={() => handleVerifyAndComplete(s.id)}
                      disabled={loading || isMining}
                      className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-bold shadow-lg"
                    >
                      {loading || isMining ? "Processing..." : "✓ Verify & Release " + s.flowAmount + " ETH"}
                    </button>
                    <p className="text-xs text-green-200 mt-2 text-center">
                      Review the completion photo above. Clicking verify will burn the NFT and release payment to the service provider.
                    </p>
                  </div>
                )}
                
                {/* Accept button for non-accepted services */}
                {!s.acceptedBy && !s.pendingAcceptor && s.requester !== address && (
                  <button 
                    onClick={() => handleAccept(s)} 
                    disabled={loading || isMining} 
                    className="mt-2 w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {loading || isMining ? "Processing..." : "🤝 Request to Accept Service"}
                  </button>
                )}
                
                {/* Show accepted status for others */}
                {s.acceptedBy && s.acceptedBy !== address && s.requester !== address && (
                  <div className="mt-2 p-2 bg-green-900 bg-opacity-30 border border-green-700 rounded">
                    <p className="text-green-400 text-xs text-center">✓ Service accepted by {s.acceptedBy.slice(0, 6)}...{s.acceptedBy.slice(-4)}</p>
                  </div>
                )}
                
                {/* Show when you've accepted */}
                {s.acceptedBy === address && !s.completionSubmitted && (
                  <div className="mt-2 p-2 bg-blue-900 bg-opacity-30 border border-blue-700 rounded">
                    <p className="text-blue-300 text-xs text-center">✓ You accepted this service. Upload completion proof when done.</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <MapContainer center={userLocation} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${TOKEN}`} />
        <Marker position={userLocation}><Popup>📍 You are here</Popup></Marker>
        {destination && <Marker position={destination}><Popup>🎯 Destination</Popup></Marker>}
        {services.map(s => {
          const markers = [];
          if (s.fromCoordinates) markers.push(
            <Marker 
              key={`${s.id}-from`} 
              position={s.fromCoordinates} 
              icon={createOrangeMarkerIcon(s.serviceName)}
            >
              <Popup>
                <div className="text-sm">
                  <h4 className="font-medium">{s.serviceName}</h4>
                  <p>💰 {s.flowAmount} ETH</p>
                  <p>📍 Start: {s.fromLocation}</p>
                </div>
              </Popup>
            </Marker>
          );
          if (s.toCoordinates) markers.push(
            <Marker 
              key={`${s.id}-to`} 
              position={s.toCoordinates} 
              icon={createOrangeMarkerIcon(`${s.serviceName} (End)`)}
            >
              <Popup>
                <div className="text-sm">
                  <h4 className="font-medium">{s.serviceName} - End</h4>
                  <p>🎯 Destination: {s.toLocation}</p>
                </div>
              </Popup>
            </Marker>
          );
          return markers;
        })}
        {routeStart && destination && (
          <Routing userLocation={routeStart} destination={destination} token={TOKEN} />
        )}
        <FlyToUserLocation userLocation={userLocation} />
      </MapContainer>
      
      {/* Clear Route Button */}
      {(routeStart || destination) && (
        <button
          onClick={() => {
            setRouteStart(null);
            setDestination(null);
            setSelected(null);
            notification.info("Route cleared from map");
          }}
          className="absolute bottom-4 left-4 z-[1000] px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 font-medium"
        >
          🗑️ Clear Route
        </button>
      )}
    </div>
  );
};

export default MapComponent;