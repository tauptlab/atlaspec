# Atlaspec 0.2 compact generation reference

OUTPUT: exactly one YAML document starting with `version:`; no prose, fence,
backticks, heading, or `---`. Unknown keys are invalid. `*` means required.

GRAMMAR:
- document{version*,map*,title*,description,intent*,data*,layers*,constraints,basemap,metadata}; version=0.2
- intent{task*,audience*,primary_message*}
- data{sources*,fields*}
- source is exactly {id*,type*,url*} OR {id*,type*,data*}
- field{source*,path*,measurement*,semantic_type*,unit,normalization,range,domain}; range=[number,number]; domain=[unique strings]
- layer{id*,purpose*,family*,encoding*,constraints,behavior}
- encoding{geometry*,color,size,category,label,weight}; geometry{source*,support*};
  color{field*,scheme,classification,classes}; size/category/label/weight{field*} only
- layer.constraints{missing_data,raw_count_choropleth}
- behavior{zoom_rules*}; zoom_rule{min_zoom,max_zoom,target*,action*}
- constraints{colorblind_safe,allow_duplicate_labels,protected_layers,label_priority,viewport}; viewport{width*,height*}
- basemap{style*,contrast}; metadata values are scalar string|number|boolean only

ENUMS:
- task=locate|compare|rank|distribution|distinguish
- audience=general-public|analyst|expert|operations|student
- measurement=nominal|ordinal|quantitative|temporal
- semantic_type=category|count|rate|probability|delta|rank|capacity|uncertainty|identifier|label
- normalization=none|ratio|per-capita|density
- purpose=primary|supporting|reference
- family=choropleth|proportional-symbol|categorical-point|heatmap
- support=point|line|polygon|grid
- classification=continuous|equal-interval|quantile|natural-breaks
- missing_data=explicit|hide|error
- zoom target=fill|symbols|labels|heatmap; action=show|hide|cluster|show-labels
- basemap style=minimal-light|minimal-dark|none; contrast=light|dark|auto

RULES:
- Preserve requested layer IDs/order and exact data paths. Every encoding field
  names data.fields; its source equals the layer geometry source.
- Per-layer: missing_data, raw_count_choropleth, behavior. Global: viewport,
  colorblind_safe, protected_layers, label_priority; the last two are string arrays.
- Do not copy stress labels into metadata. Do not invent zoom rules; omit behavior
  unless explicit zoom thresholds/actions are requested.
- choropleth=polygon+ordered color; raw count needs normalization or
  raw_count_choropleth: allow. proportional-symbol=point+quantitative size.
  categorical-point=point+nominal category with string domain.
  heatmap=point|grid plus optional ordinal|quantitative weight.
- Never author legend, scale, palette, symbol radius, or heatmap kernel; the
  compiler derives them.

SHAPE:
version: "0.2"
map: stable-id
title: Human title
intent: {task: compare, audience: operations, primary_message: Message}
data: {sources: [{id: areas, type: geojson, url: data/areas.geojson}], fields: {value: {source: areas, path: value, measurement: quantitative, semantic_type: rate, normalization: ratio}}}
layers: [{id: areas, purpose: primary, family: choropleth, encoding: {geometry: {source: areas, support: polygon}, color: {field: value}}, constraints: {missing_data: error}}]
constraints: {colorblind_safe: true, viewport: {width: 960, height: 640}}
