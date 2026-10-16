const {withMainActivity,withMainApplication}=require('expo/config-plugins');
function alignPackage(config,mod){
 const packageName=config.android?.package;
 if(packageName)mod.modResults.contents=mod.modResults.contents.replace(/^package\s+[^\r\n]+/m,`package ${packageName}`);
 return mod;
}
module.exports=config=>withMainApplication(withMainActivity(config,config=>{
 alignPackage(config,config);
 const marker='  override fun onCreate(';const code=config.modResults.contents;
 if(code.includes('ReaderKeys.handle'))return config;
 if(!code.includes(marker)) return config;
 config.modResults.contents=code.replace(marker,`  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (hasWindowFocus() && expo.modules.readerkeys.ReaderKeys.handle(event)) return true
    return super.dispatchKeyEvent(event)
  }

${marker}`);return config;
}),config=>alignPackage(config,config));
