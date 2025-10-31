"use client";
import dynamic from "next/dynamic";
import type { NextPage } from "next";

const DynamicMapComponent = dynamic(() => import("../components/map/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <p className="text-white text-lg">Loading map...</p>
    </div>
  ),
});

const LocationTestPage: NextPage = () => {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <DynamicMapComponent />
    </div>
  );
};

export default LocationTestPage;
