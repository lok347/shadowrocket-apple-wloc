Shadowrocket 修改 Apple WLOC 网络定位：一次完整实践与排障案例

适用场景：iOS / Shadowrocket 网络定位研究、开发测试、定位链路调试。
本文只讨论 Apple WLOC（Wi‑Fi / 蜂窝网络定位）响应修改，不涉及绕过第三方 App 的安全认证、风控或地域限制。

1. 背景

目标是在 iPhone 上通过 Shadowrocket 拦截 Apple 网络定位服务返回的数据，并将系统获得的 Wi‑Fi / 蜂窝网络定位修改为指定坐标。

本次实践基于：

batqwq/shadowrocket-location-spoofer

上游 acheong08/ios-location-spoofer

核心思路不是修改 GPS，也不是 Hook CoreLocation，而是：

iPhone locationd
        ↓
Apple /clls/wloc
        ↓
Shadowrocket HTTPS MITM
        ↓
location-spoofer.js
        ↓
解析 ARPC / protobuf
        ↓
修改 Wi-Fi / Cell Tower 坐标
        ↓
重新编码响应
        ↓
返回给 iOS

2. 技术原理

Apple 的网络定位并不是普通 JSON，而是二进制协议。

该项目主要完成三件事：

通过 Shadowrocket 对 Apple WLOC 请求进行 HTTPS MITM；

解析 /clls/wloc 返回的 ARPC / protobuf；

修改其中的 Wi‑Fi 与蜂窝基站定位数据，再重新封装响应。

主要修改对象包括：

Wi-Fi:
AppleWLoc
└── field 2: wifi_devices
    └── field 2: location

Cellular:
AppleWLoc
└── field 22 / 24: cell_tower_response
    └── field 5: location

位置字段中：

field 1 = latitude
field 2 = longitude

坐标使用：

coord × 100000000

编码后写入 protobuf。

除了经纬度，脚本还会处理：

horizontalAccuracy

verticalAccuracy

altitude

motionActivityType

motionActivityConfidence

3. 环境准备

3.1 Shadowrocket

需要：

HTTPS 解密：开启
HTTP/2 中间人攻击：开启

HTTP/2 必须开启，因为实际 Apple WLOC 请求可能通过 HTTP/2 传输。

3.2 安装 Shadowrocket CA

在 Shadowrocket 中：

HTTPS 解密
→ 证书
→ 生成 CA
→ 安装证书

然后进入 iOS：

设置
→ 通用
→ VPN 与设备管理
→ 安装 Shadowrocket CA

安装后还没有结束。

继续：

设置
→ 通用
→ 关于本机
→ 证书信任设置
→ Shadowrocket CA
→ 完全信任

这是整个方案能否成功的关键步骤之一。

4. Shadowrocket 模块

首次测试建议开启 debug。

示例坐标：

Latitude:  22.285118
Longitude: 114.159561

模块：

#!name=iOS Location Spoofer DEBUG
#!desc=Apple WLOC Wi-Fi/Cellular Location Spoofer
#!author=batqwq / acheong08 | Custom Config
#!homepage=https://github.com/batqwq/shadowrocket-location-spoofer

[Script]
iOS Location Spoofer Response = type=http-response,pattern=^https?:\/\/(?:gs-loc(?:-cn)?\.apple\.com|bluedot\.is\.autonavi\.com(?:\.gds\.alibabadns\.com)?)\/clls\/wloc(?:\?.*)?$,requires-body=1,binary-body-mode=1,max-size=1048576,timeout=10,script-path=https://raw.githubusercontent.com/batqwq/shadowrocket-location-spoofer/main/location-spoofer.js,argument=mode=response&latitude=22.285118&longitude=114.159561&horizontalAccuracy=39&verticalAccuracy=1000&altitude=530&debug=true

[MITM]
hostname = %APPEND% gs-loc.apple.com, gs-loc-cn.apple.com, bluedot.is.autonavi.com, bluedot.is.autonavi.com.gds.alibabadns.com

建议首次测试：

debug=true

成功以后改为：

debug=false

5. 正确启用顺序

实践中，配置正确但没有重新建立 PacketTunnel，也可能导致脚本没有加载。

推荐严格按以下顺序：

1. 关闭旧 WLOC / gs-loc 模块
2. 开启 HTTPS 解密
3. 开启 HTTP/2 MITM
4. 确认 CA 已完全信任
5. 启用 Location Spoofer 模块
6. 断开 Shadowrocket
7. 重新连接 Shadowrocket
8. 关闭 iOS 定位服务
9. 等待约 5~10 秒
10. 重新开启定位服务
11. 打开 Apple 地图
12. 查看 PacketTunnel 日志

首次测试建议在室内进行。

原因是本方案修改的是网络定位，不是 GPS / GNSS。

6. 如何判断是否真正成功

不要只看地图。

最重要的是看 Shadowrocket PacketTunnel 日志。

搜索：

Location spoofer

或者：

clls
gs-loc
bluedot

成功修改 Wi-Fi

可能看到：

Location spoofer patched 400 wifi devices, 0 cell towers
Location spoofer patched locations:
firstWifi=22.28511800,114.15956100

说明：

HTTPS MITM        OK
/clls/wloc        OK
Response 获取     OK
protobuf 解析     OK
Wi-Fi patch       OK

成功修改蜂窝基站

可能看到：

Location spoofer patched 0 wifi devices, 121 cell towers
Location spoofer patched locations:
firstCell=22.28511800,114.15956100

这说明蜂窝定位路径也已被修改。

7. 一个非常实用的排障树

有 Location spoofer 日志？
        │
   ┌────┴────┐
   否         是
   │          │
MITM /      patched > 0？
模块问题       │
          ┌────┴────┐
          否         是
          │          │
      Apple 本次   protobuf
      未返回可改   已成功修改
      定位结果        │
                     ↓
              地图是否改变？
                  │
             ┌────┴────┐
             是         否
             │          │
            完成    GPS / CoreLocation
                    缓存 / 融合定位

8. 实践中踩到的一个典型坑：经度负号

测试美国 Montana 坐标：

46.606887, -112.014755

理论位置：

Montana, USA

但地图却跳到了蒙古。

原因非常直接：

-112.014755

被实际配置成了：

+112.014755

两者分别代表：

-112° = 西经 → 美国
+112° = 东经 → 蒙古

因此如果目标是美国 Montana：

latitude=46.606887&longitude=-112.014755

必须保留 ASCII 半角负号：

-

不要误用：

−
–

等 Unicode 符号。

这个问题非常隐蔽，因为：

纬度是正确的；

定位修改确实成功；

地图也确实跳到了新地点；

只是经度方向完全相反。

因此一旦出现“纬度大致正确，但地图跨到另一个大陆”，第一时间检查 longitude 的正负号。

9. 为什么 Apple 地图成功，但某些 App 仍判断不在目标地区

这是本次实践中最重要的边界。

本方案修改的是：

Apple WLOC
├── Wi-Fi
└── Cell Tower

但没有修改：

GPS / GNSS
CoreLocation Framework
App 自己的定位 SDK
IP 地理位置
SIM / MCC
系统地区
时区
服务器侧位置判断

App 请求 CoreLocation 时，iOS 可能综合：

GPS
+
Wi-Fi
+
基站
+
蓝牙
+
运动传感器

生成最终 CLLocation。

所以可能出现：

Apple 地图：
网络定位已修改
✓

某第三方 App：
仍获得真实位置或判断不在目标地区
×

这并不代表 WLOC patch 失败。

如果日志已经出现：

firstWifi=目标坐标

或者：

firstCell=目标坐标

就应该停止继续修改 protobuf 脚本，转而判断：

GPS / CoreLocation
缓存
App 自有 SDK
服务端校验

10. 为什么室内测试更容易成功

iPhone 的最终定位并不是只来自 WLOC。

室外 GPS 信号很强时：

GNSS
↓
高精度真实位置

CoreLocation 很可能优先采用 GPS。

室内环境下：

GPS 弱
↓
Wi-Fi / Cell 定位权重提高
↓
WLOC patch 更容易直接体现

因此调试阶段建议：

室内
Wi-Fi 开启
Shadowrocket 已连接
再触发系统定位

11. Fail-open 是一个值得保留的设计

项目默认：

failOpen=true

含义是：

脚本解析成功
→ 修改 response

脚本解析失败
→ 原始 Apple response 正常通过

这意味着 Apple 后续即使修改 WLOC 协议结构，最坏通常是：

定位修改失效

而不是：

整个系统定位服务不可用

对于日常使用来说，这是合理的安全设计。

12. 不建议长期开启 raw dump

项目提供多种诊断模块：

inspect
raw-dump
dev
probe

但正常使用不建议开启完整 raw dump。

WLOC 原始请求 / 响应中可能包含：

附近 Wi-Fi

BSSID

蜂窝基站信息

其他位置相关数据

调试时：

debug=true
dumpRaw=false

通常已经足够。

13. Mac 是否可以使用

理论上可以测试，但不能直接假设与 iPhone 完全一致。

如果 macOS 的系统定位同样经过：

/clls/wloc

并且 Shadowrocket for macOS 能成功 MITM，那么相同的 protobuf patch 思路具备可行性。

验证方式仍然是：

Shadowrocket
→ HTTPS MITM
→ 开启模块
→ 打开 macOS 地图
→ 查看日志

只要日志出现：

Location spoofer patched ...

就说明 WLOC 路径已经命中。

14. 最终经验总结

这次实践最大的收获不是“改一个坐标”，而是确认了一套非常清晰的定位排障方法：

第一层：网络是否经过 Shadowrocket

PacketTunnel

第二层：HTTPS 是否成功 MITM

CA
HTTP/2
MITM hostname

第三层：Apple WLOC 是否命中

/clls/wloc

第四层：protobuf 是否成功解析

wifi_devices
cell_tower_response

第五层：目标坐标是否真正写入

firstWifi
firstCell

第六层：系统最终是否采用该位置

CoreLocation
GPS
缓存
融合定位

第七层：App 是否还有自己的认证机制

定位 SDK
IP
SIM
服务器校验

只有逐层验证，才能避免出现：

“地图没变”
→ 就一直修改脚本

这种无效排查。

15. 推荐正式配置

验证完成后建议：

debug=false
failOpen=true

保留最小化配置，仅在出现异常时再切换 Debug。

References

batqwq/shadowrocket-location-spoofer

acheong08/ios-location-spoofer

Apple WLOC /clls/wloc

Shadowrocket HTTPS MITM / Script Rewrite

Disclaimer

本文仅用于网络协议研究、开发测试与定位机制调试。

请不要将本方案用于绕过第三方服务的安全认证、风控、地域限制、身份验证或其他访问控制机制。
