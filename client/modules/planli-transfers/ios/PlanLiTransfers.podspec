Pod::Spec.new do |s|
  s.name = 'PlanLiTransfers'
  s.version = '1.0.0'
  s.summary = 'Durable PlanLi photo transfers'
  s.description = 'Background file transfers for owned Firebase staging uploads.'
  s.license = { :type => 'MIT' }
  s.author = 'PlanLi'
  s.homepage = 'https://planli.app'
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.resource_bundles = { 'PlanLiTransfers_privacy' => ['PrivacyInfo.xcprivacy'] }
  s.source_files = '**/*.swift'
end
