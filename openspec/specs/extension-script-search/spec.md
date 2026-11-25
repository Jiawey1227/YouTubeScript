# extension-script-search Specification

## Purpose

让扩展按开关定时向本机脚本领取一部剧，在同一个不抢焦点的 YouTube 标签里搜索，并把播放量原文、没有匹配或搜索失败交回脚本。

## Requirements

### Requirement: Poll the local script only while the switch is on
控制页 SHALL 提供一个默认关闭的开关，并把开关状态保存在扩展本地。关掉控制页或重启 Chrome MUST NOT 把已打开的开关关掉。只有用户关掉开关，扩展才停止领取新剧名。开关打开时，扩展 SHALL 大约每 30 秒向监听 `127.0.0.1` 的脚本询问一次，即使用户已经关掉控制页。开关关闭时，已经开始的脚本搜索 MUST 收完并返回结果，尚未领取的剧名 MUST NOT 再领取。

#### Scenario: The switch survives a closed control page
- **WHEN** 用户打开开关后关掉控制页
- **THEN** 扩展继续大约每 30 秒向脚本询问

#### Scenario: Turning the switch off finishes the current script search
- **WHEN** 一部脚本剧的搜索已经开始，用户关掉开关
- **THEN** 扩展完成这次搜索并把结果交回脚本，之后不再领取新剧名

### Requirement: Take one drama at a time
扩展询问时 MUST 说明控制页是否正在手工搜索。正在手工搜索，或上一部脚本搜索还没有返回明确结果时，扩展 MUST NOT 领取新剧名。脚本回答现在没有可交的剧时，扩展 MUST NOT 把任何剧记成失败，并在下一个周期再问。扩展 SHALL 把领取到的一个剧名交给现有标题搜索，并只把匹配视频的播放量原文、没有匹配，或搜索失败及原因交回脚本。

#### Scenario: A manual search delays the script
- **WHEN** 控制页正在进行手工搜索，扩展向脚本询问
- **THEN** 扩展不领取新剧名，脚本队列中的文件保持未完成

#### Scenario: The script has nothing ready
- **WHEN** 脚本回答现在没有可交的剧
- **THEN** 扩展不记录搜索失败，并等待下一次询问

### Requirement: Reuse one background YouTube tab for script searches
脚本搜索 SHALL 只使用一个 YouTube 标签。打开或导航这个标签时 MUST NOT 把用户当前正在看的页面切走。下一部剧 MUST 在这个标签中打开新的搜索地址。没有剧要搜或开关关掉时，扩展 MUST NOT 主动关闭这个标签。扩展 MUST 记住它；它还在就继续使用，已经被关掉时，下一部需要搜索时再开一个。扩展 MUST NOT 关闭用户自己打开的其他 YouTube 页面。每一轮新的手工搜索仍 SHALL 另开一个 YouTube 标签。

#### Scenario: Several script dramas reuse the same tab
- **WHEN** 脚本连续交出两部剧，第一部搜索使用的标签仍然开着
- **THEN** 第二部在同一个标签中打开搜索页，扩展不新增 YouTube 标签，也不切换用户当前页面

#### Scenario: An idle script tab stays open
- **WHEN** 脚本队列为空，或用户关掉开关
- **THEN** 脚本使用的那个 YouTube 标签保持打开

#### Scenario: A closed script tab is opened again for the next drama
- **WHEN** 用户关掉了脚本使用的 YouTube 标签，之后脚本又交出一部剧
- **THEN** 扩展新开一个不抢焦点的标签来搜索这一部
