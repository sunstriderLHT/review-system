# -*- coding: utf-8 -*-
"""
Created on Sat Feb 28 23:02:10 2026

@author: hanta
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_compress import Compress
import pymysql
import json
from dbutils.pooled_db import PooledDB

app = Flask(__name__)
CORS(app)
Compress(app)

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '123456',
    'database': 'review_system',
    'cursorclass': pymysql.cursors.DictCursor
}

db_pool = PooledDB(pymysql, 5, **DB_CONFIG)

def get_db_connection():
    return db_pool.connection()

# 1. 获取全量数据 (GET /api/data)
@app.route('/api/data', methods=['GET'])
def get_data():
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM knowledge_points")
            kp_rows = cursor.fetchall()
            
            cursor.execute("SELECT * FROM wrong_questions")
            wq_rows = cursor.fetchall()

        # 将数据库的下划线命名(snake_case)转换为前端需要的驼峰命名(camelCase)
        kp = []
        for row in kp_rows:
            # 解析 JSON 字符串
            tags = json.loads(row['tags']) if isinstance(row['tags'], str) else row['tags']
            kp.append({
                'id': row['id'],
                'category': row['category'],
                'title': row['title'],
                'link': row['link'],
                'tags': tags,
                'desc': row['description'],
                'isPerfect': bool(row['is_perfect']),
                'createdAt': row['created_at'],
                'nextReview': row['next_review'],
                'stage': row['stage']
            })

        wq = []
        for row in wq_rows:
            tags = json.loads(row['tags']) if isinstance(row['tags'], str) else row['tags']
            wq.append({
                'id': row['id'],
                'qType': row['q_type'],
                'title': row['title'],
                'link': row['link'],
                'tags': tags,
                'note': row['note'],
                'createdAt': row['created_at']
            })

        return jsonify({'kp': kp, 'wq': wq})
    except Exception as e:
        print("查询数据失败:", e)
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 2. 新增知识点 (POST /api/kp)
@app.route('/api/kp', methods=['POST'])
def add_kp():
    data = request.json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            sql = """INSERT INTO knowledge_points 
                     (id, category, title, link, tags, description, is_perfect, created_at, next_review, stage) 
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""
            cursor.execute(sql, (
                data['id'], data['category'], data['title'], data['link'],
                json.dumps(data['tags']), data.get('desc', ''), int(data['isPerfect']),
                data['createdAt'], data['nextReview'], data['stage']
            ))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 3. 更新知识点复习状态 (PUT /api/kp/<id>)
@app.route('/api/kp/<kp_id>', methods=['PUT'])
def update_kp(kp_id):
    data = request.json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            sql = "UPDATE knowledge_points SET next_review = %s, stage = %s, is_perfect = %s WHERE id = %s"
            cursor.execute(sql, (data['nextReview'], data['stage'], int(data['isPerfect']), kp_id))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 3.1 更新知识点详情 (PUT /api/kp/<id>/details)
@app.route('/api/kp/<kp_id>/details', methods=['PUT'])
def update_kp_details(kp_id):
    data = request.json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            sql = """UPDATE knowledge_points 
                     SET title = %s, link = %s, tags = %s, description = %s, is_perfect = %s 
                     WHERE id = %s"""
            cursor.execute(sql, (
                data.get('title'), data.get('link'), 
                json.dumps(data.get('tags', [])),
                data.get('desc', ''), 
                int(data.get('isPerfect', 0)), 
                kp_id
            ))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 4. 删除知识点 (DELETE /api/kp/<id>)
@app.route('/api/kp/<kp_id>', methods=['DELETE'])
def delete_kp(kp_id):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM knowledge_points WHERE id = %s", (kp_id,))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 5. 新增错题 (POST /api/wq)
@app.route('/api/wq', methods=['POST'])
def add_wq():
    data = request.json
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            sql = """INSERT INTO wrong_questions 
                     (id, q_type, title, link, tags, note, created_at) 
                     VALUES (%s, %s, %s, %s, %s, %s, %s)"""
            cursor.execute(sql, (
                data['id'], data['qType'], data['title'], data['link'],
                json.dumps(data['tags']), data.get('note', ''), data['createdAt']
            ))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 6. 删除错题 (DELETE /api/wq/<id>)
@app.route('/api/wq/<wq_id>', methods=['DELETE'])
def delete_wq(wq_id):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM wrong_questions WHERE id = %s", (wq_id,))
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# 7. 创建索引 (仅首次运行)
@app.route('/api/init-indexes', methods=['POST'])
def init_indexes():
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_kp_next_review ON knowledge_points(next_review)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_kp_category ON knowledge_points(category)")
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

if __name__ == '__main__':
    app.run(port=3000)