// Upstream sends a Section with circular hook state; only serialize public fields.
export function prepareEpubTemplate(contents:string, options?:{anchor?:string|null;generateLocations?:boolean}){
 if(!contents.includes("type: 'onRendered'"))return contents;
 if(options?.anchor)contents=contents.replace('var displayed = rendition.display();',`var displayed = rendition.display(${JSON.stringify(options.anchor)});`);
 // The visible reader owns index generation. Hidden previews use its cached
 // index instead of independently scanning every chapter in a large anthology.
 if(options?.generateLocations===false)contents=contents.replace('if (initialLocations) {','if (!initialLocations) return; if (initialLocations) {');
 // Return initial display so its rejection reaches the wrapper error handler.
 contents=contents.replace('          displayed.then(function () {','          displayed = displayed.then(function () {');
 // Keep metadata/navigation setup reachable; return only after registering it.
 contents=contents.replace('landmarks: item.landmarks\n            }));\n          });\n        })', 'landmarks: item.landmarks\n            }));\n          });\n          return displayed;\n        })').replace('reason: reason','reason: String(err && err.message || err)');
 return contents.replace('Math.floor(percent * 100)', 'percent * 100').replace('section: section,','section: {index:section.index,href:section.href,idref:section.idref},')
 // Location generation may unload the section DOM while a relocation is emitted.
 // An unavailable chapter label must not interrupt progress or scrolling.
 .replace('var chapter = getChapter(location);', 'var chapter=null;try{chapter=getChapter(location);}catch(error){chapter=book.navigation.get(location.start.href)||null;}')
 .replace('var percent = book.locations.percentageFromCfi(location.start.cfi);', 'try{window.qrProgress?.report(location);}catch(error){} var percent = book.locations.percentageFromCfi(location.start.cfi);');
}
