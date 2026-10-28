from io import BytesIO
import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from openpyxl import Workbook, load_workbook

import web_server as web
from src.grades_io import read_grades_workbook, export_grades_workbook, validate_grade_records


class GradeExchange(unittest.TestCase):
    def test_read_sheets_headers_codes_and_blank_formula_results(self):
        book = Workbook(); sheet = book.active; sheet.title = 'ציונים'
        sheet.append(['דוח ציונים']); sheet.append([])
        sheet.append(['שם קורס', 'קוד קורס', 'נק״ז', 'ציון'])
        sheet.append(['אלגוריתמים', 7, 4, 0]); sheet['B4'].number_format = '00000'
        sheet.append(['קורס נוסף', '008', 2.5, '=40+50'])
        second = book.create_sheet('אחר'); second.append(['Name', 'Credits', 'Grade'])
        buffer = BytesIO(); book.save(buffer); book.close()
        data = read_grades_workbook(buffer.getvalue())
        self.assertEqual(len(data['sheets']), 2)
        rows = data['sheets'][0]['rows']
        self.assertEqual(rows[1]['number'], 3)
        self.assertEqual(rows[2]['cells'], ['אלגוריתמים', '00007', 4, 0])
        self.assertIsNone(rows[3]['cells'][3])  # Formula without a cached value is never invented.

    def test_export_roundtrip_preserves_grades_exclusions_and_formula_like_names_as_text(self):
        payload = dict(actual=[dict(name='=1+1', code='0001', credits=3.5, grade=0, included=True),
                               dict(name='פטור', code='', credits=2, grade=None, included=False)],
                       planned=[dict(name='עתידי', code='002', credits=4, grade=95, included=True)])
        encoded = export_grades_workbook(payload)
        book = load_workbook(BytesIO(encoded), data_only=False)
        self.assertEqual(book['ציונים']['A2'].value, '=1+1')
        self.assertEqual(book['ציונים']['A2'].data_type, 's')
        self.assertEqual(book['ציונים']['B2'].value, '0001')
        self.assertEqual(book['ציונים']['D2'].value, 0)
        self.assertEqual(book['ציונים']['E3'].value, 'לא')
        self.assertEqual(book['תרחיש עתידי']['D2'].value, 95)
        book.close()
        self.assertEqual(len(read_grades_workbook(encoded)['sheets']), 2)

    def test_invalid_records_and_workbooks(self):
        good = dict(name='קורס', code='', credits=3, grade=85, included=True)
        for updates in ({'grade':101}, {'grade':True}, {'grade':None}, {'credits':-1}, {'credits':float('inf')}, {'included':'yes'}, {'name':''}):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                validate_grade_records([{**good, **updates}])
        with self.assertRaises(ValueError):
            read_grades_workbook(b'not an xlsx')
        book = Workbook(); book.active['BI1'] = 'too wide'; buffer = BytesIO(); book.save(buffer); book.close()
        with self.assertRaises(ValueError):
            read_grades_workbook(buffer.getvalue())
        self.assertTrue(export_grades_workbook())

    def test_grade_routes_are_separate_from_timetable_data_and_return_errors(self):
        server = web.ThreadingHTTPServer(('127.0.0.1', 0), web.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        snapshot = set(web.DATASETS)
        try:
            with urlopen(base+'/web/grades.html') as response:
                self.assertIn('מחשבון'.encode(), response.read())
            with urlopen(base+'/api/grades/template') as response:
                template = response.read()
            with urlopen(Request(base+'/api/grades/import', data=template)) as response:
                self.assertIn('sheets', json.load(response))
            payload = dict(actual=[dict(name='קורס', credits=3, grade=80, included=True)], planned=[])
            with urlopen(Request(base+'/api/grades/export', data=json.dumps(payload).encode())) as response:
                self.assertIn('spreadsheetml', response.headers['Content-Type'])
                self.assertTrue(response.read().startswith(b'PK'))
            with self.assertRaises(HTTPError) as failure:
                urlopen(Request(base+'/api/grades/import',data=b'invalid'))
            self.assertEqual(failure.exception.code,400); failure.exception.close()
            self.assertEqual(set(web.DATASETS),snapshot)
        finally:
            server.shutdown();server.server_close();thread.join()
