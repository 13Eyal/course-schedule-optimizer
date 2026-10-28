"""Bounded XLSX exchange for the grade calculator, independent of timetable data."""
from datetime import date, datetime
from io import BytesIO
from math import isfinite
import re
from zipfile import ZipFile, BadZipFile

from openpyxl import load_workbook, Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.utils.exceptions import InvalidFileException

MAX_ROWS = 5000
HEADERS = ['שם קורס', 'קוד קורס', 'נק״ז', 'ציון', 'נכלל בממוצע']
XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def read_grades_workbook(data):
    try:
        with ZipFile(BytesIO(data)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 25 * 1024 * 1024:
                raise ValueError('קובץ הציונים גדול מדי לאחר פתיחה. יש לפצל אותו לקבצים קטנים יותר.')
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True, keep_links=False)
    except (BadZipFile, InvalidFileException, OSError, KeyError) as error:
        raise ValueError('לא ניתן לקרוא את הקובץ. יש לבחור קובץ xlsx תקין.') from error
    try:
        if len(workbook.worksheets) > 20:
            raise ValueError('אפשר לייבא קובץ עם עד 20 גיליונות.')
        sheets, total_rows = [], 0
        for sheet in workbook.worksheets:
            if (sheet.max_row or 0) > MAX_ROWS + 50 or (sheet.max_column or 0) > 60:
                raise ValueError(f'הגיליון {sheet.title} גדול מדי. יש להשאיר עד {MAX_ROWS} שורות ו־60 עמודות.')
            rows = []
            for number, cells in enumerate(sheet.iter_rows(), 1):
                if number > MAX_ROWS + 50 or len(cells) > 60:
                    raise ValueError(f'הגיליון {sheet.title} חורג ממגבלת השורות או העמודות.')
                values = []
                for cell in cells:
                    value = cell.value
                    if isinstance(value, (date, datetime)):
                        value = value.isoformat()
                    elif isinstance(value, (int, float)) and not isinstance(value, bool):
                        if not isfinite(value):
                            raise ValueError(f'ערך מספרי לא תקין בגיליון {sheet.title}, שורה {number}.')
                        # Preserve course codes stored as numbers with a zero-padding format.
                        if float(value).is_integer() and re.fullmatch(r'0{2,30}', cell.number_format or ''):
                            value = str(int(value)).zfill(len(cell.number_format))
                    if isinstance(value, str) and len(value) > 1000:
                        raise ValueError(f'תוכן ארוך מדי בגיליון {sheet.title}, שורה {number}.')
                    values.append(value)
                if any(value is not None and str(value).strip() for value in values):
                    rows.append({'number': number, 'cells': values})
            total_rows += len(rows)
            if total_rows > MAX_ROWS + 50:
                raise ValueError(f'אפשר לייבא עד {MAX_ROWS} שורות בקובץ אחד.')
            if rows:
                sheets.append({'name': sheet.title, 'rows': rows})
        if not sheets:
            raise ValueError('קובץ הציונים ריק.')
        return {'sheets': sheets}
    finally:
        workbook.close()


def validate_grade_records(records, planned=False):
    if not isinstance(records, list) or len(records) > MAX_ROWS:
        raise ValueError(f'רשימת ציונים חייבת להכיל עד {MAX_ROWS} קורסים.')
    cleaned = []
    for row in records:
        if not isinstance(row, dict):
            raise ValueError('פרטי הקורס אינם תקינים.')
        name, code = row.get('name'), row.get('code', '')
        if not isinstance(name, str) or not name.strip() or len(name) > 200:
            raise ValueError('שם קורס חייב להכיל עד 200 תווים ואינו יכול להיות ריק.')
        if not isinstance(code, str) or len(code) > 80:
            raise ValueError('קוד קורס חייב להיות טקסט באורך של עד 80 תווים.')
        credits, grade, included = row.get('credits'), row.get('grade'), row.get('included', True)
        if type(credits) not in (int, float) or not isfinite(credits) or not 0 <= credits <= 1000:
            raise ValueError('נק״ז חייבות להיות מספר בין 0 ל־1000.')
        if type(included) is not bool:
            raise ValueError('סימון הכללה בממוצע חייב להיות כן או לא.')
        if grade is not None and (type(grade) not in (int, float) or not isfinite(grade) or not 0 <= grade <= 100):
            raise ValueError('ציון חייב להיות מספר בין 0 ל־100.')
        if grade is None and included:
            raise ValueError('קורס ללא ציון מספרי אינו יכול להיכלל בממוצע.')
        if planned and (credits <= 0 or grade is None):
            raise ValueError('לקורס עתידי נדרשות נק״ז חיוביות וציון צפוי.')
        cleaned.append({'name': name.strip(), 'code': code.strip(), 'credits': credits,
                        'grade': grade, 'included': included})
    return cleaned


def export_grades_workbook(payload=None):
    """Generate the application's download, with user text forced to string cells."""
    if payload is not None and not isinstance(payload, dict):
        raise ValueError('בקשת הייצוא אינה תקינה.')
    actual = validate_grade_records(payload.get('actual', [])) if payload is not None else []
    planned = validate_grade_records(payload.get('planned', []), planned=True) if payload is not None else []
    if len(actual) + len(planned) > MAX_ROWS:
        raise ValueError(f'אפשר לייצא עד {MAX_ROWS} קורסים.')
    workbook = Workbook()
    for index, (title, records) in enumerate([('ציונים', actual), ('תרחיש עתידי', planned)]):
        sheet = workbook.active if index == 0 else workbook.create_sheet()
        sheet.title = title
        sheet.sheet_view.rightToLeft = True
        sheet.append(HEADERS)
        for cell in sheet[1]:
            cell.font = Font(color='FFFFFF', bold=True)
            cell.fill = PatternFill('solid', fgColor='002FA7')
            cell.alignment = Alignment(horizontal='right')
        for row in records:
            sheet.append([row['name'], row['code'], row['credits'], row['grade'], 'כן' if row['included'] else 'לא'])
            for column in (1, 2):
                sheet.cell(sheet.max_row, column).data_type = 's'
            for column in (3, 4):
                sheet.cell(sheet.max_row, column).number_format = '0.##'
        for column, width in enumerate([38, 18, 12, 12, 20], 1):
            sheet.column_dimensions[get_column_letter(column)].width = width
        sheet.freeze_panes = 'A2'
        sheet.auto_filter.ref = sheet.dimensions
    buffer = BytesIO()
    workbook.save(buffer)
    workbook.close()
    return buffer.getvalue()
