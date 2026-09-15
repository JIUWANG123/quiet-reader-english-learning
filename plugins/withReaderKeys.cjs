const {withMainActivity}=require('expo/config-plugins');
module.exports=config=>withMainActivity(config,config=>{
 const marker='  override fun onCreate(';const code=config.modResults.contents;
 if(code.includes('ReaderKeys.handle'))return config;
 if(!code.includes(marker))throw Error('MainActivity template changed; reader key hook not installed');
 config.modResults.contents=code.replace(marker,`  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (hasWindowFocus() && expo.modules.readerkeys.ReaderKeys.handle(event)) return true
    return super.dispatchKeyEvent(event)
  }

${marker}`);return config;
});
