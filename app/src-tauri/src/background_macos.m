#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>

// Keeps channel polling timers alive while the window is hidden (App Nap opt-out). Idle system sleep is still allowed.
static id<NSObject> nexusActivity = nil;
void nexus_background_activity(int on) {
    @autoreleasepool {
        if (on && !nexusActivity) {
            nexusActivity = [[NSProcessInfo processInfo] beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep
                                                                           reason:@"Nexus принимает задачи из каналов"];
        } else if (!on && nexusActivity) {
            [[NSProcessInfo processInfo] endActivity:nexusActivity];
            nexusActivity = nil;
        }
    }
}
// 0 off, 1 enabled, 2 requires approval, 3 not found, 4 unsupported macOS.
int nexus_login_item_status(void) {
    if (@available(macOS 13.0, *)) {
        switch ([SMAppService mainAppService].status) {
            case SMAppServiceStatusEnabled: return 1;
            case SMAppServiceStatusRequiresApproval: return 2;
            case SMAppServiceStatusNotFound: return 3;
            default: return 0;
        }
    }
    return 4;
}
int nexus_login_item_set(int on) {
    if (@available(macOS 13.0, *)) {
        NSError *error = nil;
        BOOL ok = on ? [[SMAppService mainAppService] registerAndReturnError:&error]
                     : [[SMAppService mainAppService] unregisterAndReturnError:&error];
        return ok ? 0 : (int)(error ? error.code : -1);
    }
    return -2;
}
