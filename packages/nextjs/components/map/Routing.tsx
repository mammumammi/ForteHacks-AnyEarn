import L from "leaflet";
import "leaflet-routing-machine";
import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

type LatLng = [number, number];

interface RoutingProps {
  userLocation: LatLng;
  destination: LatLng;
  token: string;
}

const Routing: React.FC<RoutingProps> = ({ userLocation, destination, token }) => {
  const map = useMap();
  const routingControlRef = useRef<L.Routing.Control | null>(null);

  useEffect(() => {
    if (!map || !userLocation || !destination || !token) {
      console.warn("Routing: Missing required props", { map: !!map, userLocation, destination, token: !!token });
      return;
    }

    console.log("Creating routing control...");
    console.log("From:", userLocation);
    console.log("To:", destination);

    try {
      // Remove existing routing control if any
      if (routingControlRef.current) {
        console.log("Removing existing route...");
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }

      // Create new routing control
      const routingControl = L.Routing.control({
        waypoints: [
          L.latLng(userLocation[0], userLocation[1]),
          L.latLng(destination[0], destination[1]),
        ],
        router: L.Routing.mapbox(token, {
          profile: "mapbox/driving",
        }),
        show: false,
        addWaypoints: false,
        routeWhileDragging: false,
        lineOptions: {
          styles: [{ color: "#6FA1EC", weight: 4 }],
          extendToWaypoints: false,
          missingRouteTolerance: 10,
        },
        collapsible: false,
      });

      // Add event listeners
      routingControl.on('routesfound', (e) => {
        console.log("✅ Route found successfully!");
        const routes = e.routes;
        const summary = routes[0].summary;
        console.log(`Distance: ${(summary.totalDistance / 1000).toFixed(2)} km`);
        console.log(`Duration: ${(summary.totalTime / 60).toFixed(0)} minutes`);
      });

      routingControl.on('routingerror', (e) => {
        console.error("❌ Routing error:", e);
      });

      routingControl.addTo(map);
      routingControlRef.current = routingControl;

      console.log("Routing control added to map");

      // Fit map bounds to show entire route
      setTimeout(() => {
        const bounds = L.latLngBounds([userLocation, destination]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }, 500);

    } catch (error) {
      console.error("Error creating routing control:", error);
    }

    // Cleanup function
    return () => {
      if (routingControlRef.current) {
        console.log("Cleaning up routing control...");
        try {
          map.removeControl(routingControlRef.current);
          routingControlRef.current = null;
        } catch (err) {
          console.error("Error removing routing control:", err);
        }
      }
    };
  }, [map, userLocation, destination, token]);

  return null;
};

export default Routing;