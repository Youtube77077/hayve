import CoreLocation
import ExpoModulesCore
import MapKit

/// Apple Maps services for Hayve on iPhone and iPad: real road routes (MKDirections),
/// nearest address (CLGeocoder) and place search (MKLocalSearch). No API key required.
public class HayveAppleMapsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HayveAppleMaps")

    AsyncFunction("route") { (fromLat: Double, fromLng: Double, toLat: Double, toLng: Double, promise: Promise) in
      let request = MKDirections.Request()
      request.source = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: fromLat, longitude: fromLng)))
      request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: toLat, longitude: toLng)))
      request.transportType = .automobile
      MKDirections(request: request).calculate { response, error in
        guard let route = response?.routes.first else {
          promise.reject("E_ROUTE", error?.localizedDescription ?? "No route found")
          return
        }
        let count = route.polyline.pointCount
        var points = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: count)
        route.polyline.getCoordinates(&points, range: NSRange(location: 0, length: count))
        let coordinates: [[Double]] = points.map { [$0.longitude, $0.latitude] }
        let result: [String: Any] = [
          "coordinates": coordinates,
          "distance": route.distance,
          "duration": route.expectedTravelTime,
        ]
        promise.resolve(result)
      }
    }

    AsyncFunction("reverseGeocode") { (lat: Double, lng: Double, promise: Promise) in
      CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: lat, longitude: lng)) { placemarks, error in
        guard let p = placemarks?.first else {
          promise.reject("E_GEOCODE", error?.localizedDescription ?? "No address found")
          return
        }
        let street = [p.thoroughfare, p.subThoroughfare].compactMap { $0 }.joined(separator: " ")
        let area = [p.postalCode, p.locality].compactMap { $0 }.joined(separator: " ")
        let result: [String: Any] = [
          "name": street.isEmpty ? (p.name ?? "") : street,
          "address": area,
          "lat": p.location?.coordinate.latitude ?? lat,
          "lng": p.location?.coordinate.longitude ?? lng,
        ]
        promise.resolve(result)
      }
    }

    AsyncFunction("search") { (query: String, lat: Double, lng: Double, promise: Promise) in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), latitudinalMeters: 40000, longitudinalMeters: 40000)
      MKLocalSearch(request: request).start { response, _ in
        let items = response?.mapItems ?? []
        let results: [[String: Any]] = items.prefix(8).map { (item: MKMapItem) -> [String: Any] in
          let pm = item.placemark
          let line = [[pm.thoroughfare, pm.subThoroughfare].compactMap { $0 }.joined(separator: " "), pm.locality ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
          return ["name": item.name ?? line, "address": line, "lat": pm.coordinate.latitude, "lng": pm.coordinate.longitude]
        }
        promise.resolve(results)
      }
    }
  }
}
