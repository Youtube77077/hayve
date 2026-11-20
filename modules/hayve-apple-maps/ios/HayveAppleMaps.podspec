Pod::Spec.new do |s|
  s.name           = 'HayveAppleMaps'
  s.version        = '1.0.0'
  s.summary        = 'Apple MapKit routes, reverse geocoding and place search for Hayve'
  s.description    = 'Exposes MKDirections, CLGeocoder and MKLocalSearch to JavaScript (no API key needed).'
  s.author         = 'Hayve'
  s.homepage       = 'https://hayve.app'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MapKit', 'CoreLocation'
  s.source_files   = '**/*.{h,m,swift}'
end
