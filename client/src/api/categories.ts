/**
 * @file categories.ts
 * @description カテゴリAPIコール関数
 *
 * ## 使用方法
 * これらの関数は直接コンポーネントから呼ばず、
 * hooks/ のカスタムフック経由（useQuery / useMutation）で使用すること。
 *
 * ## ソフトデリートについて
 * deleteCategory は物理削除でなくソフトデリート（is_active = 0）。
 * salesテーブル等から外部キー参照されているため、物理削除はDB制約違反になる。
 */

import api from './client';
import type { Category } from '../types';

/**
 * アクティブなカテゴリ一覧を取得する。
 * sort_order の昇順で返される（サーバー側でORDER BY sort_order）。
 *
 * @returns Category[] — アクティブカテゴリの配列
 */
export const fetchCategories = () =>
  api.get<Category[]>('/categories').then((r) => r.data);

/**
 * 新規カテゴリを作成する。
 *
 * @param data - カテゴリ作成データ
 * @param data.name - カテゴリ名（必須）
 * @param data.sort_order - 表示順（省略時はDBデフォルト）
 * @returns 作成されたカテゴリ
 */
export const createCategory = (data: { name: string; sort_order?: number }) =>
  api.post<Category>('/categories', data).then((r) => r.data);

/**
 * カテゴリ情報を更新する。
 *
 * @param id - 更新対象カテゴリID
 * @param data - 更新フィールド（部分更新可）
 * @returns 更新後のカテゴリ
 */
export const updateCategory = (id: number, data: Partial<Category>) =>
  api.put<Category>(`/categories/${id}`, data).then((r) => r.data);

/**
 * カテゴリを削除する（ソフトデリート: is_active = 0）。
 * 売上・予定データが紐付いている場合も削除可能（FK参照は残る）。
 *
 * @param id - 削除対象カテゴリID
 */
export const deleteCategory = (id: number) =>
  api.delete(`/categories/${id}`);
