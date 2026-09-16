from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

report_path = Path(r"D:\Workspace\mini12306\实验报告_Mini12306_待提交.docx")
image_dir = Path(r"C:\Users\31794\AppData\Local\Temp")
images = [
    ("codex-clipboard-ed87a57a-73ca-480d-956e-e854f7b8b4c8.png", "图 1  登录页面：手机号与密码登录入口"),
    ("codex-clipboard-69a09ce3-9cfb-42a6-9885-58e476860c4d.png", "图 2  注册页面：虚构实名信息与短信验证码表单"),
    ("codex-clipboard-df40c129-ecbe-4ae7-ae0c-2f8e7c824ac4.png", "图 3  车次列表：车次筛选、排序和余票状态展示"),
    ("codex-clipboard-31742576-6630-493a-b718-60bb68860916.png", "图 4  确认订单：乘车人、席别和费用核对"),
    ("codex-clipboard-090b4cb9-47ea-4a1e-80e9-192d5a5ddffa.png", "图 5  订单支付：模拟支付方式选择与订单金额展示"),
    ("codex-clipboard-4e586da3-22e6-42bd-bb44-ffc5bf05aa8c.png", "图 6  我的订单：不同订单状态及操作入口"),
    ("codex-clipboard-c86608ec-9d2f-40f0-aa87-690b282155bb.png", "图 7  申请退票：退款明细、退票原因与确认操作"),
    ("codex-clipboard-5cda9a0f-f703-40bf-9423-c7feedbdbf26.png", "图 8  车票改签：可选车次、差额计算与确认操作"),
    ("codex-clipboard-f5187146-6edb-4191-9ff5-88069d7c8b3b.png", "图 9  个人中心：旅客专属资料、订单统计和功能入口"),
]
for filename, _ in images:
    image_path = image_dir / filename
    if not image_path.exists():
        raise FileNotFoundError(image_path)

doc = Document(report_path)
section = doc.sections[-1]
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.72)
section.left_margin = Inches(0.78)
section.right_margin = Inches(0.78)

# 中文字体设置：同时设置东亚字体，避免中文显示为默认西文字体。
def set_font(run, size=11, bold=False, color=None, font_name="宋体"):
    run.font.name = font_name
    run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_text(text, size=11, bold=False, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=6, first_indent=True):
    paragraph = doc.add_paragraph()
    paragraph.alignment = align
    paragraph.paragraph_format.space_before = Pt(space_before)
    paragraph.paragraph_format.space_after = Pt(space_after)
    paragraph.paragraph_format.line_spacing = 1.35
    if first_indent:
        paragraph.paragraph_format.first_line_indent = Inches(0.28)
    run = paragraph.add_run(text)
    set_font(run, size=size, bold=bold)
    return paragraph


def add_heading(text, level=1):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.space_before = Pt(10 if level == 1 else 7)
    paragraph.paragraph_format.space_after = Pt(5)
    paragraph.paragraph_format.keep_with_next = True
    run = paragraph.add_run(text)
    set_font(run, size=15 if level == 1 else 13, bold=True, color=(26, 91, 196))
    return paragraph


def add_bullet(text):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.left_indent = Inches(0.28)
    paragraph.paragraph_format.first_line_indent = Inches(-0.18)
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.paragraph_format.line_spacing = 1.25
    run = paragraph.add_run("• " + text)
    set_font(run, size=10.5)
    return paragraph


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement('w:shd')
    shading.set(qn('w:fill'), fill)
    tc_pr.append(shading)


def add_architecture_table():
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    headers = [('模块', '作用')]
    rows = [
        ('页面层', '独立 HTML 页面提供登录、注册、购票查询、订单、退票、改签和个人中心界面。'),
        ('样式层', 'common.css 与页面样式采用 375px 移动端优先设计，主色为 #1A5BC4，并适配电脑浏览器。'),
        ('业务层', '原生 JavaScript 完成登录校验、查询条件传递、车次筛选排序、订单操作和旅客专属展示。'),
        ('数据层', 'storage.js 统一读写 LocalStorage；mock-data.js 提供虚构用户、车次、库存和订单数据。'),
        ('模拟服务层', '短信、实名认证、支付、退款均为本地演示流程，不连接真实身份证、银行卡或支付渠道。'),
    ]
    for row_index, row in enumerate(headers + rows):
        cells = table.rows[0].cells if row_index == 0 else table.add_row().cells
        for index, value in enumerate(row):
            cells[index].width = Inches(1.25 if index == 0 else 5.45)
            cells[index].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_shading(cells[index], 'EAF1FF' if row_index == 0 else 'FFFFFF')
            paragraph = cells[index].paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(2)
            paragraph.paragraph_format.space_before = Pt(2)
            run = paragraph.add_run(value)
            set_font(run, size=10, bold=(row_index == 0))
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

# 保留模板原有内容；从新页开始补充实验过程记录。
doc.add_page_break()

center_title = doc.add_paragraph()
center_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
center_title.paragraph_format.space_after = Pt(9)
run = center_title.add_run('Mini-12306 在线购票系统（mini01）实验过程与结果补充')
set_font(run, size=16, bold=True, color=(26, 91, 196), font_name='黑体')

add_text('说明：本页及后续内容为在原实验报告模板原文之后补充的实验过程、结果和结论；模板中已有内容、封面信息和预习内容均未改动。', size=10, first_indent=False, space_after=8)

add_heading('一、系统分析与界面原型设计')
add_text('Mini-12306 是一个用于学习与演示的本地铁路购票系统原型，项目命名为 mini01。系统面向旅客提供注册、登录、车次查询、下单确认、模拟支付、订单查看、退票、改签和个人中心等功能。页面采用 375px 宽度的移动端优先设计，同时可在 Windows 与 macOS 的主流浏览器中使用。')
add_text('系统采用“页面—业务—数据”的本地结构：HTML5 负责页面内容，CSS3 负责布局和视觉风格，原生 JavaScript 负责交互与业务判断，LocalStorage 负责本机浏览器中的演示数据持久化。项目不使用框架和第三方库，便于理解每个页面、脚本和数据文件的职责。')
add_architecture_table()
add_text('主要业务流程为：旅客登录后填写出发地、目的地和日期，系统保存查询条件并展示匹配车次；旅客选择有余票的车次，核对乘车人与费用后创建待支付订单；模拟支付成功后生成已支付订单；在符合规则时可继续进行退票或改签。每位旅客只读取自己的订单和个人资料，实现演示范围内的旅客专属界面。')

add_heading('二、结对编程过程记录')
add_text('本次实验采用“驾驶员/领航员”结对方式。用户担任驾驶员，负责提出 Mini-12306 的产品目标、页面功能、设计要求以及技术方案选择；Codex 担任领航员，根据已确认的《Mini-12306 协作规范 v0.3》提供页面结构、样式、JavaScript 逻辑、数据设计、测试思路和修改建议。')
add_text('角色互换记录：本次协作未发生角色互换。驾驶员持续负责需求确认与成果验收，领航员持续负责方案解释、代码实现建议与问题检查。该记录依据本次对话过程填写。')
add_text('任务分工：驾驶员确认了原生 HTML/CSS/JavaScript + LocalStorage 的技术路线、移动端优先设计规范、功能范围及界面调整要求；领航员完成了项目基础结构建议、LocalStorage 统一封装、模拟车次与用户数据、登录状态校验、车次查询列表、订单页面和旅客专属界面等实现支持。')
add_text('工作照片：待补充。当前未提供真实的结对现场工作照片，因此本报告不虚构照片；提交前可由实验小组补充实际工作照片。', first_indent=False)

add_heading('三、开发过程、测试记录与问题处理')
add_bullet('完成产品需求与协作规范整理，明确系统为纯前端本地演示项目，使用虚构身份、支付和车次数据。')
add_bullet('搭建 css、js、pages 目录结构；将公共视觉规则放入 common.css，将 LocalStorage 读写集中封装在 storage.js。')
add_bullet('准备 8 条覆盖武汉—北京、武汉—上海等线路的模拟车次数据，并准备 4 个测试账号，其中包含 2 个旅客账号。')
add_bullet('实现手机号和密码登录：手机号须为 11 位且以 1 开头；连续输错密码 3 次后锁定 5 分钟；登录成功后写入 currentUser；30 分钟无操作后要求重新登录。')
add_bullet('实现查询条件校验与保存、车次列表渲染、全部/高铁动车/普通列车筛选，以及按出发时间、历时和票价排序。余票状态按“充足、紧张、无票”区分，无票车次不可选择。')
add_bullet('实现订单确认、模拟支付、订单列表、退票、改签和个人中心原型。订单数据按 userId 过滤，使不同旅客登录后看到自己的订单与资料。')
add_bullet('发现并处理的界面问题：登录页不应显示首页、订单、我的底部导航，因此移除了登录页导航；订单页的退票、改签按钮文字调整为按钮中间对齐。')
add_bullet('测试结果：使用测试旅客账号登录后可进入购票查询页；查询武汉至北京等线路后可显示对应车次；有票车次可进入订单确认和模拟支付页面；订单页可显示不同状态；退票与改签页面可展示金额、规则与确认操作。')

add_heading('四、实验结论')
add_text('本实验完成了 Mini-12306 在线购票系统的 UI 原型与核心前端流程演示。系统使用原生 HTML5、CSS3、JavaScript 和 LocalStorage 实现，满足移动端优先、电脑浏览器可用、页面独立、数据本地持久化和旅客专属展示等目标。通过模拟数据，完整展示了登录、注册、车次查询、订单确认、支付、订单管理、退票、改签和个人中心的主要页面与交互路径。')
add_text('系统当前定位为教学和作品演示，因此 LocalStorage 数据只保存在本机浏览器中，不能跨设备共享；身份证认证、短信和支付均为模拟流程，不处理真实个人信息或资金。若后续需要正式运营，应另行设计服务器、数据库、真实第三方服务与安全合规方案。')

# 新页插入结果截图，每页一张，确保界面文字可读。
doc.add_page_break()
result_title = doc.add_paragraph()
result_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
result_title.paragraph_format.space_after = Pt(8)
run = result_title.add_run('五、实验结果：Mini-12306 UI 原型截图')
set_font(run, size=16, bold=True, color=(26, 91, 196), font_name='黑体')
intro = add_text('以下为本次实验已完成页面的界面截图。所有页面均使用虚构演示数据，展示内容不包含真实身份、银行卡或支付信息。', size=10.5, first_indent=False, space_after=8)

for index, (filename, caption) in enumerate(images):
    if index > 0:
        doc.add_page_break()
    image_path = image_dir / filename
    picture_paragraph = doc.add_paragraph()
    picture_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture_paragraph.paragraph_format.space_before = Pt(3)
    picture_paragraph.paragraph_format.space_after = Pt(4)
    picture_paragraph.add_run().add_picture(str(image_path), width=Inches(3.18))
    caption_paragraph = doc.add_paragraph()
    caption_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_paragraph.paragraph_format.space_after = Pt(2)
    caption_run = caption_paragraph.add_run(caption)
    set_font(caption_run, size=10.5, bold=False)

# 保存为新的提交副本。
doc.save(report_path)
print(report_path)
