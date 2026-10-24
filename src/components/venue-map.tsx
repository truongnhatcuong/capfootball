"use client";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
export default function VenueMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return <MapContainer center={[lat, lng]} zoom={15} className="venue-map" scrollWheelZoom={false}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={[lat, lng]} radius={11} pathOptions={{ color: "#0c7454", fillColor: "#a6ef67", fillOpacity: 1 }}><Popup>{name}</Popup></CircleMarker></MapContainer>;
}
