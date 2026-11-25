## ADDED Requirements

### Requirement: Manual search waits for an active script search
脚本搜索进行时，控制页 MUST NOT 开始新的手工搜索，也 MUST NOT 清除脚本搜索。控制页 SHALL 显示正在由脚本搜索。脚本搜索的结果 MUST NOT 进入手工搜索的结果表。关掉控制页 MUST 只取消当前手工搜索，MUST NOT 取消已经开始的脚本搜索。

#### Scenario: The control page cannot start over a script search
- **WHEN** 一部由脚本交出的剧正在搜索，用户在控制页尝试开始或清除
- **THEN** 手工搜索不开始，脚本搜索不被清除，页面显示正在由脚本搜索

#### Scenario: Closing the page cancels only the manual search
- **WHEN** 用户关掉正在进行手工搜索的控制页
- **THEN** 这一轮手工搜索取消，脚本搜索的开关状态和未完成队列保持不变
