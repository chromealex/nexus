#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <unistd.h>

// This function runs inside the NEXUS process. Return an owned UTF-8 JSON buffer.
static NSString *attr(AXUIElementRef el, CFStringRef key) {
 CFTypeRef v=NULL;
 if(AXUIElementCopyAttributeValue(el,key,&v)!=kAXErrorSuccess||!v)return nil;
 NSString *out=CFGetTypeID(v)==CFStringGetTypeID()? [(__bridge NSString *)v copy]:nil;
 CFRelease(v);return out;
}
static NSArray *kids(AXUIElementRef el) {
 CFTypeRef v=NULL;
 if(AXUIElementCopyAttributeValue(el,kAXChildrenAttribute,&v)!=kAXErrorSuccess||!v)return @[];
 NSArray *a=CFGetTypeID(v)==CFArrayGetTypeID()? [(__bridge NSArray *)v copy]:@[];
 CFRelease(v);return a;
}
static NSString *label(AXUIElementRef el) {
 NSMutableArray *a=[NSMutableArray array];
 for(id key in @[(__bridge id)kAXTitleAttribute,(__bridge id)kAXValueAttribute,(__bridge id)kAXDescriptionAttribute]){
  NSString *v=attr(el,(__bridge CFStringRef)key);
  if(v.length && v.length<300)[a addObject:v];
 }
 return [a componentsJoinedByString:@" "];
}
static NSArray *walk(AXUIElementRef root) {
 NSMutableArray *queue=[NSMutableArray arrayWithObject:(__bridge id)root];
 for(NSUInteger i=0;i<queue.count && i<2000;i++){
  AXUIElementRef el=(__bridge AXUIElementRef)queue[i];
  for(id child in kids(el)){if(queue.count<2200)[queue addObject:child];}
 }
 return queue;
}
static NSArray *windows(AXUIElementRef app){
 CFTypeRef v=NULL;
 if(AXUIElementCopyAttributeValue(app,kAXWindowsAttribute,&v)!=kAXErrorSuccess||!v)return @[];
 NSArray *a=CFGetTypeID(v)==CFArrayGetTypeID()? [(__bridge NSArray *)v copy]:@[];
 CFRelease(v);return a;
}
static NSString *readText(AXUIElementRef app){
 NSMutableArray *parts=[NSMutableArray array];
 for(id win in windows(app))for(id obj in walk((__bridge AXUIElementRef)win)){
  AXUIElementRef el=(__bridge AXUIElementRef)obj;
  NSString *role=attr(el,kAXRoleAttribute);
  if([@[@"AXStaticText",@"AXTextField",@"AXTextArea",@"AXHeading",@"AXButton",@"AXGroup"] containsObject:role]){
   NSString *v=label(el);if(v.length)[parts addObject:v];
  }
 }
 return [parts componentsJoinedByString:@"\n"];
}
static BOOL click(AXUIElementRef app,NSArray<NSString *> *names){
 for(id win in windows(app))for(id obj in walk((__bridge AXUIElementRef)win)){
  AXUIElementRef el=(__bridge AXUIElementRef)obj;
  NSString *role=attr(el,kAXRoleAttribute);
  if(![@[@"AXButton",@"AXMenuItem",@"AXRadioButton",@"AXTab",@"AXRow"] containsObject:role])continue;
  NSString *name=label(el).lowercaseString;
  for(NSString *wanted in names)if([name isEqualToString:wanted]||[name hasPrefix:[wanted stringByAppendingString:@" "]]){
   if(AXUIElementPerformAction(el,kAXPressAction)==kAXErrorSuccess)return YES;
  }
 }
 return NO;
}
static NSDictionary *parse(NSString *text){
 if(![text.lowercaseString containsString:@"this week"]&&![text.lowercaseString containsString:@"limit hit"])return nil;
 NSRegularExpression *rx=[NSRegularExpression regularExpressionWithPattern:@"(\\\\d{1,3}(?:[.,]\\\\d+)?)\\\\s*%\\\\s*used" options:NSRegularExpressionCaseInsensitive error:nil];
 NSTextCheckingResult *m=[rx firstMatchInString:text options:0 range:NSMakeRange(0,text.length)];
 if(!m)return nil;
 double used=[[[text substringWithRange:[m rangeAtIndex:1]] stringByReplacingOccurrencesOfString:@"," withString:@"."] doubleValue];
 if(used<0||used>100)return nil;
 NSRegularExpression *rr=[NSRegularExpression regularExpressionWithPattern:@"(?:resets|reset)\\\\s+([^\\\\n]{4,100})" options:NSRegularExpressionCaseInsensitive error:nil];
 NSTextCheckingResult *r=[rr firstMatchInString:text options:0 range:NSMakeRange(0,text.length)];
 NSString *reset=r?[text substringWithRange:[r rangeAtIndex:1]]:nil;
 return @{@"used":@(used),@"reset":reset?:[NSNull null]};
}
static NSDictionary *result(NSString *status,NSString *detail,NSDictionary *extra){
 NSMutableDictionary *d=[@{@"status":status,@"detail":detail,@"source":@"Claude Desktop Accessibility (native)",@"recordedAt":[[NSISO8601DateFormatter new] stringFromDate:[NSDate date]]} mutableCopy];
 if(extra)[d addEntriesFromDictionary:extra];return d;
}
static NSDictionary *collect(void){
 if(!AXIsProcessTrusted())return result(@"permission_required",@"Grant Accessibility to NEXUS in System Settings and restart NEXUS.",nil);
 __block NSRunningApplication *target=nil;
 for(NSRunningApplication *a in NSWorkspace.sharedWorkspace.runningApplications)
  if([a.bundleIdentifier isEqualToString:@"com.anthropic.claudefordesktop"]||[a.localizedName.lowercaseString isEqualToString:@"claude"]){target=a;break;}
 if(!target){
  NSURL *url=[NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:@"com.anthropic.claudefordesktop"];
  if(!url)return result(@"not_running",@"Claude Desktop is not installed or not discoverable.",nil);
  dispatch_semaphore_t sem=dispatch_semaphore_create(0);
  [NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:[NSWorkspaceOpenConfiguration configuration] completionHandler:^(NSRunningApplication *app,NSError *error){target=app;dispatch_semaphore_signal(sem);}];
  dispatch_semaphore_wait(sem,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC));
  if(!target)return result(@"not_running",@"Could not launch Claude Desktop.",nil);
 }
 [target activateWithOptions:0];
 AXUIElementRef app=AXUIElementCreateApplication(target.processIdentifier);
 AXUIElementSetMessagingTimeout(app,2.0);
 NSString *text=readText(app);
 NSDictionary *data=parse(text);
 if(!data){
  BOOL settings=click(app,@[@"settings",@"preferences"]);
  if(!settings){
   CFTypeRef bar=NULL;
   if(AXUIElementCopyAttributeValue(app,kAXMenuBarAttribute,&bar)==kAXErrorSuccess&&bar){
    for(id obj in walk((AXUIElementRef)bar)){
     NSString *v=label((__bridge AXUIElementRef)obj).lowercaseString;
     if([v containsString:@"settings"]||[v containsString:@"preferences"]){
      if(AXUIElementPerformAction((__bridge AXUIElementRef)obj,kAXPressAction)==kAXErrorSuccess){settings=YES;break;}
     }
    }
    CFRelease(bar);
   }
  }
  if(settings)[NSThread sleepForTimeInterval:0.7];
  BOOL usage=click(app,@[@"usage",@"your usage"]);
  for(int i=0;i<6&&!data;i++){
   [NSThread sleepForTimeInterval:0.6];
   data=parse(readText(app));
   if(!data&&!usage)usage=click(app,@[@"usage",@"your usage"]);
  }
  if(!data){
   CFRelease(app);
   return result(!settings?@"settings_not_found":(!usage?@"usage_not_found":@"usage_not_accessible"),
    @"Could not read Claude Usage through Accessibility. Check that the Usage screen is open. No quota was inferred.",@{@"settingsOpened":@(settings),@"usageOpened":@(usage)});
  }
 }
 CFRelease(app);
 return result(@"available",@"Read from Claude Desktop. This account is not verified against any NEXUS CLI profile.",data);
}
char *nexus_claude_ax_collect(void){
 @autoreleasepool {
  NSDictionary *d=collect();
  NSData *json=[NSJSONSerialization dataWithJSONObject:d options:0 error:nil];
  if(!json)return NULL;
  const char *bytes=[[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String;
  return bytes?strdup(bytes):NULL;
 }
}
void nexus_claude_ax_free(char *s){free(s);}


// Read-only diagnostics. Does not activate or click Claude, and never reads credentials.
char *nexus_claude_ax_diagnostics(void){
 @autoreleasepool {
  BOOL trusted=AXIsProcessTrusted();
  NSMutableDictionary *report=[@{
   @"accessibilityTrusted":@(trusted),
   @"nexusBundleId":NSRunningApplication.currentApplication.bundleIdentifier?:@"unknown",
   @"nexusExecutable":NSBundle.mainBundle.executablePath?:@"unknown",
   @"nexusBundlePath":NSBundle.mainBundle.bundlePath?:@"unknown",
   @"nexusPid":@(getpid()),
   @"claudeRunning":@NO,
   @"windows":@[],
   @"status":trusted?@"ready_to_inspect":@"permission_required"
  } mutableCopy];
  NSRunningApplication *claude=nil;
  for(NSRunningApplication *a in NSWorkspace.sharedWorkspace.runningApplications){
   if([a.bundleIdentifier isEqualToString:@"com.anthropic.claudefordesktop"]||
      [a.localizedName.lowercaseString isEqualToString:@"claude"]){claude=a;break;}
  }
  if(claude){
   report[@"claudeRunning"]=@YES;
   report[@"claudeBundleId"]=claude.bundleIdentifier?:@"unknown";
   report[@"claudePid"]=@(claude.processIdentifier);
   if(trusted){
    AXUIElementRef app=AXUIElementCreateApplication(claude.processIdentifier);
    AXUIElementSetMessagingTimeout(app,1.5);
    CFTypeRef winValue=NULL;
    AXError error=AXUIElementCopyAttributeValue(app,kAXWindowsAttribute,&winValue);
    report[@"windowsAXError"]=@(error);
    NSMutableArray *items=[NSMutableArray array];
    if(error==kAXErrorSuccess&&winValue&&CFGetTypeID(winValue)==CFArrayGetTypeID()){
     NSArray *wins=(__bridge NSArray *)winValue;
     for(id win in [wins subarrayWithRange:NSMakeRange(0,MIN(wins.count,10))]){
      AXUIElementRef w=(__bridge AXUIElementRef)win;
      NSArray *nodes=walk(w);
      NSUInteger readable=0,usage=0;
      for(id obj in nodes){
       AXUIElementRef el=(__bridge AXUIElementRef)obj;
       NSString *role=attr(el,kAXRoleAttribute);
       if([@[@"AXStaticText",@"AXTextField",@"AXTextArea",@"AXHeading",@"AXButton"] containsObject:role]){
        NSString *v=label(el);
        if(v.length){readable++;if([v.lowercaseString containsString:@"usage"])usage++;}
       }
      }
      [items addObject:@{
       @"title":attr(w,kAXTitleAttribute)?:@"",
       @"elementCount":@(nodes.count),
       @"readableElementCount":@(readable),
       @"usageLabelCount":@(usage)
      }];
     }
    }
    if(winValue)CFRelease(winValue);
    CFRelease(app);
    report[@"windows"]=items;
   }
  }
  NSData *data=[NSJSONSerialization dataWithJSONObject:report options:0 error:nil];
  NSString *json=data?[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding]:nil;
  return json?strdup(json.UTF8String):NULL;
 }
}
