"""MP-06.l SQL-role, active-profile and containment tests on owned local fixtures."""
import hashlib
import importlib.util
import json
import re
import runpy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify_functions = runpy.run_path(str(ROOT / 'scripts/verify-function-authority.py'))['verify_functions']
# B1: each customer rule is one tagged line (`if ... then -- rule:name`) in the migration; the suite
# neutralises exactly that line, or applies one text substitution, inside the one function it names, and
# the refusal case must then fail. Expected text is the failing operation of the suite, in suite order.
ORDER_MIGRATIONS = [ROOT / 'supabase/migrations/20260101003500_place_order.sql',
                    ROOT / 'supabase/migrations/20260101003600_order_lookup.sql',
                    ROOT / 'supabase/migrations/20260101003700_staff_orders.sql',
                    ROOT / 'supabase/migrations/20260101003800_shop_status.sql',
                    ROOT / 'supabase/migrations/20260101003900_staff_orders_review.sql',
                    ROOT / 'supabase/migrations/20260101004000_order_extras.sql',
                    ROOT / 'supabase/migrations/20260101004100_scheduled_events.sql',
                    ROOT / 'supabase/migrations/20260101004200_scheduled_event_rent.sql',
                    ROOT / 'supabase/migrations/20260101004300_stock_catalogue.sql',
                    ROOT / 'supabase/migrations/20260101004400_recipes.sql',
                    ROOT / 'supabase/migrations/20260101004500_stock_unit_guard.sql',
                    ROOT / 'supabase/migrations/20260101004600_stock_ledger.sql',
                    ROOT / 'supabase/migrations/20260101004700_production.sql',
                    ROOT / 'supabase/migrations/20260101004800_production_discard.sql',
                    ROOT / 'supabase/migrations/20260101004900_books.sql',
                    ROOT / 'supabase/migrations/20260101005000_operations.sql',
                    ROOT / 'supabase/migrations/20260101005400_business_clock_shop_identity.sql',
                    ROOT / 'supabase/migrations/20260101005500_identity_links.sql',
                    ROOT / 'supabase/migrations/20260101005600_item_costs.sql',
                    ROOT / 'supabase/migrations/20260101005700_clock_policies.sql',
                    ROOT / 'supabase/migrations/20260101005800_batch_correction.sql',
                    ROOT / 'supabase/migrations/20260101005900_packaging_records.sql',
                    ROOT / 'supabase/migrations/20260101006100_cost_cutover.sql',
                    ROOT / 'supabase/migrations/20260101006200_cost_cutover_by_seq.sql',
                    ROOT / 'supabase/migrations/20260101006300_cost_cutover_by_value.sql']
_OUT = 'order outcome differs: anon / '
# the line a used or wasted stock writes in get_books: the value expensed (20260101006300: what the use or waste is worth at its stamp, less what
# the allowance of the cutover covers)
_LINE_Q = "round((v_used -> m.id::text ->> 'v')::numeric)"
_CHK = 'order check differs: anon / '
_LOOK = 'lookup check differs: anon / '
ORDER_MUTATIONS = {
    'rule_keys_required': ('place_order', 'rule', 'keys-required', _OUT + 'place_missing_field / '),
    'rule_keys_unknown': ('place_order', 'rule', 'keys-unknown', _OUT + 'place_unknown_price / '),
    'rule_replay': ('place_order', 'rule', 'replay', _OUT + 'place_replay_same_body / '),
    'rule_client_id_reuse': ('place_order', 'rule', 'client-id-reuse', _OUT + 'place_replay_other_body / '),
    'rule_window': ('place_order', 'rule', 'window', _OUT + 'place_closed_window / '),
    'rule_method': ('place_order', 'rule', 'method', _OUT + 'place_method_unknown / '),
    'rule_pickup_day': ('place_order', 'rule', 'pickup-day', _OUT + 'place_pickup_tuesday / '),
    'rule_pickup_lead': ('place_order', 'rule', 'pickup-lead', _OUT + 'place_pickup_too_far / '),
    'rule_pickup_time': ('place_order', 'rule', 'pickup-time', _OUT + 'place_time_before_open / '),
    'rule_menu': ('place_order', 'rule', 'menu', _OUT + 'place_item_unpublished / '),
    'rule_max_per_order': ('place_order', 'rule', 'max-per-order', _OUT + 'place_over_max / '),
    'rule_phone_limit': ('place_order', 'rule', 'phone-limit', _OUT + 'place_phone_limit / '),
    'rule_capacity': ('place_order', 'rule', 'capacity', _OUT + 'place_capacity_full / '),
    'rule_waitlist_date': ('join_waitlist', 'rule', 'waitlist-date', _OUT + 'wait_date_past / '),
    'rule_waitlist_client_id_reuse': ('join_waitlist', 'rule', 'waitlist-client-id-reuse', _OUT + 'wait_replay_other_body / '),
    'rule_waitlist_replay': ('join_waitlist', 'rule', 'waitlist-replay', _OUT + 'wait_replay_other_body / '),
    'rule_waitlist_dedupe': ('join_waitlist', 'rule', 'waitlist-dedupe', 'duplicate key value violates unique constraint'),
    'rule_waitlist_limit': ('join_waitlist', 'rule', 'waitlist-limit', _OUT + 'wait_limit / '),
    'text_menu_published': ('place_order', 'text',
                            ('join public.products p on p.id = t.pid and p.published and p.active;',
                             'join public.products p on p.id = t.pid and p.active;'), _OUT + 'place_item_unpublished / '),
    'text_menu_active': ('place_order', 'text',
                         ('join public.products p on p.id = t.pid and p.published and p.active;',
                          'join public.products p on p.id = t.pid and p.published;'), _OUT + 'place_item_inactive / '),
    'text_method_active': ('place_order', 'text',
                           ('where m.active and m.label = v_method', 'where m.label = v_method'), _OUT + 'place_method_inactive / '),
    'text_weight_committed': ('place_order', 'text',
                              ('sum(oi.qty * oi.capacity_weight)', 'sum(oi.qty)'), _OUT + 'place_capacity_full / '),
    'text_weight_requested': ('place_order', 'text',
                              ('coalesce(sum(t.qty * p.capacity_weight), 0)', 'coalesce(sum(t.qty), 0)'), _OUT + 'cap_fries_too_heavy / '),
    'text_hold_expiry': ('order_holds_capacity', 'text',
                         ('then p_now < p_placed_at + make_interval(hours => greatest(0, p_hold_hours))', 'then true'),
                         _OUT + 'place_phone_after_expiry / '),
    'text_hold_refunded': ('order_holds_capacity', 'text',
                           ("when p_pay = 'refunded' then false", "when false then false"), _OUT + 'cap_refund_and_cancel_release / '),
    'text_hold_cancelled': ('order_holds_capacity', 'text',
                            ("when p_state in ('Cancelled', 'No-show') then false", "when false then false"),
                            _OUT + 'cap_refund_and_cancel_release / '),
    'text_status_leaks_phone': ('order_status', 'text',
                                ("'order_no', o.id, 'state'", "'order_no', o.id, 'phone', o.phone, 'state'"),
                                _CHK + 'status_keys_exact'),
    'text_erase_keeps_token': ('anonymise_customer', 'text',
                               ("ig = '',\n           status_token = null,\n", "ig = '',\n"),
                               'erased paid order kept personal data'),
    'text_erase_keeps_waitlist': ('anonymise_customer', 'text',
                                  ('delete from waitlist_entries where phone = v_norm;', 'null;'),
                                  'erased number kept waitlist entries'),
    'text_prune_keeps_handle': ('prune_personal_data', 'text',
                                ("notes = '', ig = '',\n           status_token = null, payload_hash = null", "notes = '',\n           status_token = null, payload_hash = null"), 'prune kept personal data'),
    'text_prune_keeps_waitlist': ('prune_personal_data', 'text',
                                  ("delete from public.waitlist_entries where created_at < v_now - interval '365 days';", 'null;'),
                                  'prune kept personal data'),
}
LOOKUP_MUTATIONS = {
    'rule_find_throttle': ('find_order', 'rule', 'find-throttle', _LOOK + 'find_locked_after_ten'),
    'rule_find_phone': ('find_order', 'rule', 'find-phone', _LOOK + 'find_wrong_phone'),
    'text_find_plus63': ('find_order', 'text',
                         ("  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;\n", ''),
                         _LOOK + 'find_plus63'),
    'text_find_ten_digit': ('find_order', 'text',
                            ("  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;\n", ''),
                            _LOOK + 'find_ten_digit'),
    'text_rules_leak_limits': ('get_shop_order_rules', 'text',
                               ("'unpaid_hold_hours', r.unpaid_hold_hours)", "'unpaid_hold_hours', r.unpaid_hold_hours, 'max_unpaid_per_phone', r.max_unpaid_per_phone)"),
                               _LOOK + 'rules_keys_are_the_customer_ones'),
}
_STF = 'staff outcome differs: active_owner / '
STAFF_MUTATIONS = {
    'rule_confirm_replay': ('staff_confirm_payment', 'rule', 'confirm-replay', _STF + 'confirm_replay / '),
    'rule_confirm_stale': ('staff_confirm_payment', 'rule', 'stale', _STF + 'confirm_stale / '),
    'rule_confirm_state': ('staff_confirm_payment', 'rule', 'confirm-state', _STF + 'confirm_cancelled / '),
    'rule_confirm_capacity': ('staff_confirm_payment', 'rule', 'confirm-capacity', _STF + 'confirm_lapsed_over_capacity / '),
    'rule_reject_replay': ('staff_reject_payment', 'rule', 'reject-replay', _STF + 'reject_replay / '),
    'rule_reject_stale': ('staff_reject_payment', 'rule', 'stale', _STF + 'reject_stale / '),
    'rule_reject_state': ('staff_reject_payment', 'rule', 'reject-state', _STF + 'reject_paid_order / '),
    'rule_reopen_replay': ('staff_reopen_order', 'rule', 'reopen-replay', _STF + 'reopen_replay / '),
    'rule_reopen_stale': ('staff_reopen_order', 'rule', 'stale', _STF + 'reopen_stale / '),
    'rule_reopen_state': ('staff_reopen_order', 'rule', 'reopen-state', _STF + 'reopen_paid_order / '),
    'rule_status_replay': ('staff_set_status', 'rule', 'status-replay', _STF + 'status_replay / '),
    'rule_status_stale': ('staff_set_status', 'rule', 'stale', _STF + 'status_stale / '),
    'rule_status_transition': ('staff_set_status', 'rule', 'status-transition', _STF + 'status_illegal / '),
    'rule_pack_flagged': ('staff_set_status', 'rule', 'pack-flagged', _STF + 'pack_flagged / '),
    'rule_flag_item': ('staff_flag_item', 'rule', 'flag-item', _STF + 'flag_missing_item / '),
    'rule_flag_replay': ('staff_flag_item', 'rule', 'flag-replay', _STF + 'flag_replay / '),
    'rule_flag_stale': ('staff_flag_item', 'rule', 'stale', _STF + 'flag_stale / '),
    'rule_flag_state': ('staff_flag_item', 'rule', 'flag-state', _STF + 'flag_finished / '),
    'rule_swap_client_id_reuse': ('staff_swap_item', 'rule', 'swap-client-id-reuse', _STF + 'swap_client_id_reuse / '),
    'rule_swap_stale': ('staff_swap_item', 'rule', 'stale', _STF + 'swap_stale / '),
    'rule_swap_state': ('staff_swap_item', 'rule', 'swap-state', _STF + 'swap_finished / '),
    'rule_swap_same': ('staff_swap_item', 'rule', 'swap-same', _STF + 'swap_same / '),
    'rule_swap_item': ('staff_swap_item', 'rule', 'swap-item', _STF + 'swap_missing_item / '),
    'rule_swap_menu': ('staff_swap_item', 'rule', 'swap-menu', _STF + 'swap_menu / '),
    'rule_swap_price_clash': ('staff_swap_item', 'rule', 'swap-price-clash', _STF + 'swap_price_clash / '),
    'rule_swap_capacity': ('staff_swap_item', 'rule', 'swap-capacity', _STF + 'swap_capacity / '),
    'rule_refund_replay': ('staff_refund', 'rule', 'refund-replay', _STF + 'refund_replay / '),
    'rule_refund_stale': ('staff_refund', 'rule', 'stale', _STF + 'refund_stale / '),
    'rule_refund_paid': ('staff_refund', 'rule', 'refund-paid', _STF + 'refund_unpaid / '),
    'rule_settle_replay': ('staff_settle_balance', 'rule', 'settle-replay', _STF + 'settle_replay / '),
    'rule_settle_stale': ('staff_settle_balance', 'rule', 'stale', _STF + 'settle_stale / '),
    'rule_settle_paid': ('staff_settle_balance', 'rule', 'settle-paid', _STF + 'settle_unpaid / '),
}
_SHP = 'shop state outcome differs: '
SHOP_MUTATIONS = {
    'rule_override_closed': ('place_order', 'rule', 'override-closed', _SHP + 'anon / place_while_closed / '),
    'rule_override_soldout': ('place_order', 'rule', 'override-soldout', _SHP + 'anon / place_while_soldout / '),
    'rule_override_mode': ('set_shop_override', 'rule', 'override-mode', _SHP + 'active_owner / override_bad_mode / '),
    'text_override_open_skips_window': ('place_order', 'text',
                                        (" and v_override is distinct from 'open' and v_override is distinct from 'soon' then -- rule:window", " then -- rule:window"),
                                        _SHP + 'anon / place_open_outside_window / '),
    'text_status_leaks_capacity': ('get_shop_status', 'text',
                                   ("'override',  (select s.override from public.shop_state s where s.id))",
                                    "'override',  (select s.override from public.shop_state s where s.id), 'capacity', 200)"),
                                   'shop state check differs: anon / shop_status_keys_exact'),
}
STAFF_MUTATIONS |= {
    'rule_reopen_capacity': ('staff_reopen_order', 'rule', 'reopen-capacity', _STF + 'reopen_over_capacity / '),
    'rule_reopen_phone_limit': ('staff_reopen_order', 'rule', 'reopen-phone-limit', _STF + 'reopen_phone_limit / '),
    'text_swap_keeps_surcharge': ('staff_swap_item', 'text', ('o.total_cents + (v_new_total - v_old_total)', 'v_new_total'),
                                  'staff check differs: active_owner / swap_keeps_the_surcharge'),
    'text_swap_weight_clash': ('staff_swap_item', 'text', (' or i.capacity_weight <> v_to.capacity_weight)', ')'),
                               _STF + 'swap_weight_clash / '),
}
STAFF_TABLE_MUTATIONS = {
    'orders_update_grant': ('grant update on public.orders to authenticated;', 'staff outcome differs: active_helper / orders_table_update / '),
}
STAFF_ACL = ('get_staff_orders()', 'staff_confirm_payment(text,timestamptz,boolean)', 'staff_reject_payment(text,timestamptz)',
             'staff_reopen_order(text,timestamptz)', 'staff_set_status(text,public.order_state,timestamptz)',
             'staff_flag_item(text,text,boolean,timestamptz)', 'staff_swap_item(text,text,text,uuid,timestamptz)',
             'staff_refund(text,text,timestamptz)', 'staff_settle_balance(text,timestamptz)')
ORDER_TABLE_MUTATIONS = {
    'orders_rows_leak': ('alter policy "orders staff read" on public.orders using (true);', _CHK + 'orders_rows_hidden'),
    'waitlist_table_select': ('grant select on public.waitlist_entries to anon;', _OUT + 'waitlist_table_select / '),
    'rules_table_select': ('grant select on public.order_rules to anon;', _OUT + 'rules_table_select / '),
}


# B4a: boxes, add-ons, the sampler cap and the same-day surcharge (order-extras.sql). The migration is the
# last one in ORDER_MIGRATIONS that defines each function, so these act on its definitions.
_EXO = 'extras outcome differs: anon / '
_EXC = 'extras check differs: anon / '
EXTRAS_MUTATIONS = {
    'rule_same_day_off': ('place_order', 'rule', 'same-day-off', _EXO + 'place_same_day_off / '),
    'rule_same_day_time': ('place_order', 'rule', 'same-day-time', _EXO + 'place_same_day_past_time / '),
    'rule_sampler_cap': ('place_order', 'rule', 'sampler-cap', _EXO + 'place_sampler_cap / '),
    'rule_box_size': ('place_order', 'rule', 'box-size', _EXO + 'place_box_size_unknown / '),
    'rule_box_fit': ('place_order', 'rule', 'box-fit', _EXO + 'place_box_fit / '),
    'rule_addon_dup': ('place_order', 'rule', 'addon-dup', _EXO + 'place_addon_dup / '),
    'rule_addon_unknown': ('place_order', 'rule', 'addon-unknown', _EXO + 'place_addon_unknown / '),
    'rule_addon_variant': ('place_order', 'rule', 'addon-variant', _EXO + 'place_addon_variant_missing / '),
    'rule_addon_text': ('place_order', 'rule', 'addon-text', _EXO + 'place_addon_text_missing / '),
    'rule_addon_qty': ('place_order', 'rule', 'addon-qty', _EXO + 'place_addon_qty / '),
    'text_total_omits_boxes': ('place_order', 'text',
                               ('v_total := v_total + v_addon_total + v_box_total + v_surcharge;',
                                'v_total := v_total + v_addon_total + v_surcharge;'), _EXC + 'box_total'),
    'text_total_omits_addons': ('place_order', 'text',
                                ('v_total := v_total + v_addon_total + v_box_total + v_surcharge;',
                                 'v_total := v_total + v_box_total + v_surcharge;'), _EXC + 'addons_total'),
    'text_surcharge_base': ('place_order', 'text',
                            ('v_base := v_total + case when v_extras.same_day_on_extras then v_addon_total + v_box_total else 0 end;',
                             'v_base := v_total;'), _EXC + 'same_day_on_extras_total'),
    'text_surcharge_rounding': ('place_order', 'text',
                                ('(v_base * v_extras.same_day_percent + 50) / 100', '(v_base * v_extras.same_day_percent) / 100'),
                                _EXC + 'same_day_rounding'),
    'text_addon_qty_per_line': ('place_order', 'text',
                                ("select coalesce(sum(t.q), 0) into v_ao_total from unnest(v_ao_ids, v_ao_qtys) as t(id, q) where t.id = v_ao_ids[v_i];",
                                 "v_ao_total := v_ao_qtys[v_i];"), _EXO + 'place_addon_qty_across_lines / '),
    'text_same_day_campus_start': ('place_order', 'text',
                                   ("then substr(v_rules.campus_from, 1, 2)::integer * 60 + substr(v_rules.campus_from, 4, 2)::integer",
                                    'then 1440'), _EXO + 'place_same_day_campus_past / '),
    'text_status_leaks_note': ('order_status', 'text', ("'variant', a.variant)", "'variant', a.variant, 'note', a.note)"),
                               _EXC + 'status_hides_note'),
    'text_erase_keeps_note': ('anonymise_customer', 'text',
                              ("update order_add_ons a set note = null\n    from orders o\n   where a.order_id = o.id and regexp_replace(o.phone, '\\D', '', 'g') = v_norm and a.note is not null;",
                               'null;'), 'extras check differs: erased paid order kept the note'),
    'text_prune_keeps_note': ('prune_personal_data', 'text',
                              ("update public.order_add_ons a set note = null\n    from public.orders o\n   where a.order_id = o.id and o.placed_at < v_now - interval '365 days' and a.note is not null;",
                               "update public.order_add_ons a set note = null\n    from public.orders o\n   where a.order_id = o.id and o.placed_at < v_now - interval '365 days' and o.phone <> '' and a.note is not null;"), 'extras check differs: prune kept the note'),
}
EXTRAS_TABLE_MUTATIONS = {
    'extras_table_select': ('grant select on public.order_extras to anon;', _EXO + 'extras_table_select / '),
    'add_ons_table_select': ('grant select on public.order_add_ons to anon;', _EXO + 'add_ons_table_select / '),
    'boxes_table_select': ('grant select on public.order_boxes to anon;', _EXO + 'boxes_table_select / '),
}

# D4: the owner's scheduled bazaar events (scheduled-events.sql), acting on the last migration that defines each function.
_SC = 'scheduled outcome differs: active_owner / '
SCHEDULED_MUTATIONS = {
    'rule_sched_keys': ('save_scheduled_event', 'rule', 'keys', _SC + 'save_keys_missing / '),
    'rule_sched_text': ('save_scheduled_event', 'rule', 'text', _SC + 'save_name_blank / '),
    'rule_sched_dates': ('save_scheduled_event', 'rule', 'dates', _SC + 'save_ends_before_start / '),
    'rule_sched_rent': ('save_scheduled_event', 'rule', 'rent', _SC + 'save_rent_negative / '),
    'rule_sched_create_stamp': ('save_scheduled_event', 'rule', 'create-stamp', _SC + 'create_with_stamp_unknown / '),
    'rule_sched_replay': ('save_scheduled_event', 'rule', 'replay', _SC + 'create_replay / '),
    'rule_sched_stale': ('save_scheduled_event', 'rule', 'stale', _SC + 'change_stale / '),
    'rule_sched_link_missing': ('link_scheduled_event', 'rule', 'link-missing', _SC + 'link_booking_missing / '),
    'rule_sched_link_event': ('link_scheduled_event', 'rule', 'link-event', _SC + 'link_event_missing / '),
    'rule_sched_link_conflict': ('link_scheduled_event', 'rule', 'link-conflict', _SC + 'link_other_event / '),
    'rule_sched_link_inactive': ('link_scheduled_event', 'rule', 'link-inactive', _SC + 'link_inactive / '),
    'rule_sched_link_rent': ('link_scheduled_event', 'rule', 'link-rent', 'scheduled check differs: active_owner / link_books_rent'),
}
SCHEDULED_TABLE_MUTATIONS = {
    'scheduled_table_select': ('grant select on public.scheduled_events to anon;',
                               'scheduled outcome differs: anon / scheduled_table_select / '),
    'scheduled_event_unique': ('drop index public.scheduled_events_event_uq;',
                               'scheduled outcome differs: active_owner / link_event_taken / '),
}

# A3: the owner's stock catalogue (stock-catalogue.sql), acting on the last migration that defines each function.
_ST = 'stock outcome differs: active_owner / '
_STC = 'stock check differs: active_owner / '
STOCK_MUTATIONS = {
    'rule_supplier_keys': ('save_supplier', 'rule', 'supplier-keys', _ST + 'sup_keys_missing / '),
    'rule_supplier_id': ('save_supplier', 'rule', 'supplier-id', _ST + 'sup_id_bad / '),
    'rule_supplier_text': ('save_supplier', 'rule', 'supplier-text', _ST + 'sup_name_blank / '),
    'rule_supplier_name_taken': ('save_supplier', 'rule', 'supplier-name-taken', _ST + 'sup_name_taken / '),
    'rule_supplier_create_stamp': ('save_supplier', 'rule', 'supplier-create-stamp', _ST + 'sup_create_with_stamp_unknown / '),
    'rule_supplier_replay': ('save_supplier', 'rule', 'supplier-replay', _ST + 'sup_create_replay / '),
    'rule_supplier_stale': ('save_supplier', 'rule', 'supplier-stale', _ST + 'sup_change_stale / '),
    'rule_item_keys': ('save_stock_item', 'rule', 'item-keys', _ST + 'item_keys_missing / '),
    'rule_item_id': ('save_stock_item', 'rule', 'item-id', _ST + 'item_id_bad / '),
    'rule_item_text': ('save_stock_item', 'rule', 'item-text', _ST + 'item_name_blank / '),
    'rule_item_category': ('save_stock_item', 'rule', 'item-category', _ST + 'item_category_bad / '),
    'rule_item_numbers': ('save_stock_item', 'rule', 'item-numbers', _ST + 'item_par_negative / '),
    'rule_item_useby': ('save_stock_item', 'rule', 'item-useby', _ST + 'item_useby_zero / '),
    'rule_item_supplier': ('save_stock_item', 'rule', 'item-supplier', _ST + 'item_supplier_unknown / '),
    'rule_item_name_taken': ('save_stock_item', 'rule', 'item-name-taken', _ST + 'item_name_taken / '),
    'rule_item_create_stamp': ('save_stock_item', 'rule', 'item-create-stamp', _ST + 'item_create_with_stamp_unknown / '),
    'rule_item_replay': ('save_stock_item', 'rule', 'item-replay', _ST + 'item_create_replay / '),
    'rule_item_stale': ('save_stock_item', 'rule', 'item-stale', _ST + 'item_change_stale / '),
    'rule_item_rename_referenced': ('save_stock_item', 'rule', 'item-rename-referenced', _ST + 'item_rename_referenced / '),
    'rule_item_unit_referenced': ('save_stock_item', 'rule', 'item-unit-referenced', _ST + 'item_unit_change_referenced / '),
    'rule_price_keys': ('save_supplier_price', 'rule', 'price-keys', _ST + 'price_keys_missing / '),
    'rule_price_text': ('save_supplier_price', 'rule', 'price-text', _ST + 'price_label_blank / '),
    'rule_price_cents': ('save_supplier_price', 'rule', 'price-cents', _ST + 'price_cents_negative / '),
    'rule_price_supplier': ('save_supplier_price', 'rule', 'price-supplier', _ST + 'price_supplier_unknown / '),
    'rule_price_item': ('save_supplier_price', 'rule', 'price-item', _ST + 'price_item_unknown / '),
    'rule_price_pack_size': ('save_supplier_price', 'rule', 'price-pack-size', _ST + 'price_pack_size_zero / '),
    'text_price_repoint_clears_size': ('save_supplier_price', 'text',
                                       ('when v_has_pack then v_pack when v_item_id is distinct from p.item_id then null else p.pack_size end',
                                        'when v_has_pack then v_pack else p.pack_size end'),
                                       _STC + 'price_repoint_clears_size'),
    'rule_price_duplicate': ('save_supplier_price', 'rule', 'price-duplicate', _ST + 'price_duplicate / '),
    'rule_price_create_stamp': ('save_supplier_price', 'rule', 'price-create-stamp', _ST + 'price_create_with_stamp_unknown / '),
    'rule_price_replay': ('save_supplier_price', 'rule', 'price-replay', _ST + 'price_create_replay / '),
    'rule_price_history': ('save_supplier_price', 'rule', 'price-history', _STC + 'price_history_pushed'),
    'rule_price_stale': ('save_supplier_price', 'rule', 'price-stale', _ST + 'price_change_stale / '),
}
STOCK_TABLE_MUTATIONS = {
    'stock_table_update': ('grant update on public.suppliers to anon;',
                           'stock outcome differs: anon / stock_suppliers_update / '),
}

# A4: the owner's recipes with versions (recipes.sql), acting on the last migration that defines each function.
_RC = 'recipe outcome differs: active_owner / '
_RCC = 'recipe check differs: active_owner / '
RECIPE_MUTATIONS = {
    'rule_recipe_keys': ('save_recipe', 'rule', 'recipe-keys', _RC + 'recipe_keys_missing / '),
    'rule_recipe_yield': ('save_recipe', 'rule', 'recipe-yield', _RC + 'recipe_yield_zero / '),
    'rule_recipe_size': ('save_recipe', 'rule', 'recipe-size', _RC + 'recipe_too_many_lines / '),
    'rule_line_keys': ('save_recipe', 'rule', 'line-keys', _RC + 'line_keys_missing / '),
    'rule_line_name': ('save_recipe', 'rule', 'line-name', _RC + 'line_name_blank / '),
    'rule_line_qty': ('save_recipe', 'rule', 'line-qty', _RC + 'line_qty_zero / '),
    'rule_line_unit': ('save_recipe', 'rule', 'line-unit', _RC + 'line_unit_kg / '),
    'rule_line_duplicate': ('save_recipe', 'rule', 'line-duplicate', _RC + 'line_duplicate / '),
    'rule_line_unit_match': ('save_recipe', 'rule', 'line-unit-match', _RC + 'line_unit_mismatch / '),
    'rule_line_item_unknown': ('save_recipe', 'rule', 'line-item-unknown', _RC + 'line_item_unknown / '),
    'rule_recipe_product': ('save_recipe', 'rule', 'recipe-product', _RC + 'recipe_product_unknown / '),
    'rule_recipe_create_stamp': ('save_recipe', 'rule', 'recipe-create-stamp', _RC + 'recipe_create_with_stamp_unknown / '),
    'rule_recipe_noop': ('save_recipe', 'rule', 'recipe-noop', _RC + 'recipe_create_replay / '),
    'rule_recipe_stale': ('save_recipe', 'rule', 'recipe-stale', _RC + 'recipe_change_stale / '),
}
RECIPE_TABLE_MUTATIONS = {
    'recipes_table_update': ('grant update on public.recipes to anon;', 'recipe outcome differs: anon / recipes_update / '),
}

# B3a: links by identity (identity-links.sql), acting on the last migration that defines each function. The operator
# (postgres) runs both functions; the cases name that actor.
_LK = 'link outcome differs: operator / '
LINK_MUTATIONS = {
    'rule_link_expected': ('apply_identity_links', 'rule', 'link-expected', _LK + 'link_expected_null / '),
    'rule_link_count_changed': ('apply_identity_links', 'rule', 'link-count-changed', _LK + 'link_apply_stale / '),
    'text_link_validates_only_when_clean': ('apply_identity_links', 'text',
                                            (" and jsonb_array_length(v_post -> 'production' -> 'missing_version') = 0 then", " then"),
                                            'violates foreign key constraint'),
}

# C1: the stock ledger (stock-ledger.sql), acting on the last migration that defines each function.
_LG = 'ledger outcome differs: active_owner / '
_LGC = 'ledger check differs: active_owner / '
LEDGER_MUTATIONS = {
    'rule_mv_keys': ('record_stock_movement', 'rule', 'mv-keys', _LG + 'mv_keys_missing / '),
    'rule_mv_id': ('record_stock_movement', 'rule', 'mv-id', _LG + 'mv_id_bad / '),
    'rule_mv_kind': ('record_stock_movement', 'rule', 'mv-kind', _LG + 'mv_kind_bad / '),
    'rule_mv_qty': ('record_stock_movement', 'rule', 'mv-qty', _LG + 'mv_receipt_qty_zero / '),
    'rule_mv_cost': ('record_stock_movement', 'rule', 'mv-cost', _LG + 'mv_cost_negative / '),
    'rule_mv_cost_kind': ('record_stock_movement', 'rule', 'mv-cost-kind', _LG + 'mv_cost_on_waste / '),
    'rule_mv_text': ('record_stock_movement', 'rule', 'mv-text', _LG + 'mv_supplier_long / '),
    'rule_mv_reason': ('record_stock_movement', 'rule', 'mv-reason', _LG + 'mv_waste_no_reason / '),
    'rule_mv_at': ('record_stock_movement', 'rule', 'mv-at', _LG + 'mv_at_future / '),
    'rule_mv_replay_conflict': ('record_stock_movement', 'rule', 'mv-replay-conflict', _LG + 'mv_replay_other_body / '),
    'rule_mv_item_missing': ('record_stock_movement', 'rule', 'mv-item-missing', _LG + 'mv_item_missing / '),
    'rule_mv_item_inactive': ('record_stock_movement', 'rule', 'mv-item-inactive', _LG + 'mv_item_inactive / '),
    'rule_mv_opening_first': ('record_stock_movement', 'rule', 'mv-opening-first', _LG + 'mv_opening_twice / '),
    'rule_mv_count_stale': ('record_stock_movement', 'rule', 'mv-count-stale', _LG + 'mv_count_stale_refused / '),
    'rule_mv_waste_clamp': ('record_stock_movement', 'rule', 'mv-waste-clamp', _LGC + 'mv_waste_stops_at_zero'),
    'rule_mv_receipt_books': ('record_stock_movement', 'rule', 'mv-receipt-books', _LGC + 'mv_receipt_books_the_cost'),
}
LEDGER_TABLE_MUTATIONS = {
    'movements_table_select': ('grant select on public.stock_movements to anon;', 'ledger outcome differs: anon / movements_select / '),
}


# C2: production (production.sql), acting on the last migration that defines each function.
_PD = 'production outcome differs: active_owner / '
_PDC = 'production check differs: active_owner / '
PRODUCTION_MUTATIONS = {
    'rule_prod_keys': ('record_production', 'rule', 'prod-keys', _PD + 'prod_keys_missing / '),
    'rule_prod_id': ('record_production', 'rule', 'prod-id', _PD + 'prod_id_bad / '),
    'rule_prod_kind': ('record_production', 'rule', 'prod-kind', _PD + 'prod_kind_pack / '),
    'rule_prod_qty': ('record_production', 'rule', 'prod-qty', _PD + 'prod_qty_zero / '),
    'rule_prod_rejects': ('record_production', 'rule', 'prod-rejects', _PD + 'prod_rejects_over / '),
    'rule_prod_target': ('record_production', 'rule', 'prod-target', _PD + 'prod_target_missing / '),
    'rule_prod_at': ('record_production', 'rule', 'prod-at', _PD + 'prod_at_future / '),
    'rule_prod_adj_dough': ('record_production', 'rule', 'prod-adj-dough', _PD + 'prod_adj_on_dough / '),
    'rule_prod_adj_range': ('record_production', 'rule', 'prod-adj-range', _PD + 'prod_adj_range / '),
    'rule_prod_replay_conflict': ('record_production', 'rule', 'prod-replay-conflict', _PD + 'prod_replay_other_body / '),
    'rule_prod_no_recipe': ('record_production', 'rule', 'prod-no-recipe', _PD + 'prod_no_recipe / '),
    'rule_prod_stale_version': ('record_production', 'rule', 'prod-stale-version', _PD + 'prod_stale_version / '),
    'rule_prod_dough_size': ('record_production', 'rule', 'prod-dough-size', _PD + 'prod_dough_too_big / '),
    'rule_prod_adj_unknown': ('record_production', 'rule', 'prod-adj-unknown', _PD + 'prod_adj_unknown / '),
    'rule_prod_shortfall': ('record_production', 'rule', 'prod-shortfall', _PDC + 'prod_shortfall_recorded'),
    'rule_pack_order_missing': ('record_pack', 'rule', 'pack-order-missing', _PD + 'pack_order_missing / '),
    'rule_pack_empty': ('record_pack', 'rule', 'pack-empty', _PD + 'pack_empty / '),
    'rule_pack_shortfall': ('record_pack', 'rule', 'pack-shortfall', _PDC + 'pack_shortfall_recorded'),
    'rule_sale_packaging_live': ('record_event_sale', 'rule', 'sale-packaging-live', _PDC + 'sale_uses_packaging'),
    'text_sale_packaging_voided': ('record_event_sale', 'text',
                                   ('if v_voided is null then -- rule:sale-packaging-live', 'if true then -- rule:sale-packaging-live'),
                                   _PDC + 'sale_voided_uses_nothing'),
    'text_use_never_more': ('use_stock_item', 'text', ('least(p_qty, v_item.on_hand)', 'p_qty'),
                            _PDC + 'prod_batch_takes_what_is_there'),
    'text_dough_first': ('record_production', 'text', ('v_used := least(greatest(v_bal, 0), v_qty)::integer;', 'v_used := 0;'),
                         _PDC + 'prod_batch_uses_dough_first'),
    'text_pcs_round_up': ('record_production', 'text', ('ceil(v_raw)', 'round(v_raw, 1)'),
                          _PDC + 'prod_dough_takes_the_scaled_lines'),
    'text_multiply_first': ('record_production', 'text', ('v_raw := v_line.qty * v_mixed / v_recipe.yield_count;', 'v_raw := v_line.qty * (v_mixed / v_recipe.yield_count);'),
                            _PDC + 'prod_dough_pieces_not_rounded_up'),
    'text_ml_step': ('record_production', 'text', ("when 'ml' then 5", "when 'ml' then 10"), _PDC + 'prod_ml_step_and_rounding'),
    'rule_disc_keys': ('record_discard', 'rule', 'disc-keys', _PD + 'disc_keys_missing / '),
    'rule_disc_id': ('record_discard', 'rule', 'disc-id', _PD + 'disc_id_bad / '),
    'rule_disc_kind': ('record_discard', 'rule', 'disc-kind', _PD + 'disc_kind_bad / '),
    'rule_disc_qty': ('record_discard', 'rule', 'disc-qty', _PD + 'disc_qty_zero / '),
    'rule_disc_reason': ('record_discard', 'rule', 'disc-reason', _PD + 'disc_reason_blank / '),
    'rule_disc_at': ('record_discard', 'rule', 'disc-at', _PD + 'disc_at_future / '),
    'rule_disc_replay_conflict': ('record_discard', 'rule', 'disc-replay-conflict', _PD + 'disc_replay_other_body / '),
    'rule_disc_more_than_there': ('record_discard', 'rule', 'disc-more-than-there', _PD + 'disc_dough_more_than_there / '),
    'text_discard_dough_balance': ('record_production', 'text', ("when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_bal", "else -r.dough_used end), 0) into v_bal"),
                                   _PDC + 'prod_discard_reduces_dough'),
    'text_discard_dough_read': ('get_production', 'text', ("when 'discard_dough' then -r.qty else -r.dough_used end)::integer as balls", "else -r.dough_used end)::integer as balls"),
                                _PDC + 'get_production_dough_after_discard'),
    'text_discard_baked_read': ('get_production', 'text', ("select r.product_id, -r.qty from public.production_records r where r.kind = 'discard_baked'", "select r.product_id, 0 from public.production_records r where r.kind = 'discard_baked'"),
                                _PDC + 'get_production_baked_after_discard'),
    # B3b: a bazaar sale and a pack take stock by item id (use_stock_item) themselves; neither costs the part it could not take.
    'text_use_stock_never_costs_the_short': ('record_sale_packaging', 'text', ('p_at, false)', 'p_at, true)'), _PDC + 'sale_pin_empty_movements'),
    'text_pack_once': ('record_pack', 'text', ("v_id := md5('pack:' || p_order)::uuid;", 'v_id := gen_random_uuid();'),
                       _PDC + 'pack_twice_takes_nothing_more'),
    # B3b: the boxes an order takes are its own (order_boxes); an order of two boxes takes two.
    'text_pack_boxes': ('record_pack', 'text', ("'boxes', ceil(v_inbox::numeric / v_s.size)::integer", "'boxes', 1"),
                        _PDC + 'pack_takes_the_packaging'),
    'text_baked_minus_packed': ('get_production', 'text', ('select oi.product_id, -oi.qty from public.production_records r', 'select oi.product_id, 0 from public.production_records r'),
                                _PDC + 'get_production_baked_not_packed'),
}
PRODUCTION_TABLE_MUTATIONS = {
    'records_table_select': ('grant select on public.production_records to anon;', 'production outcome differs: anon / records_select / '),
}


# E1: the owner's books (books.sql), acting on the last migration that defines each function.
_BK = 'books outcome differs: active_owner / '
_BKC = 'books check differs: active_owner / '
BOOKS_MUTATIONS = {
    'rule_exp_keys': ('record_expense', 'rule', 'exp-keys', _BK + 'exp_keys_missing / '),
    'rule_exp_id': ('record_expense', 'rule', 'exp-id', _BK + 'exp_id_bad / '),
    'rule_exp_text': ('record_expense', 'rule', 'exp-text', _BK + 'exp_category_blank / '),
    'rule_exp_amount': ('record_expense', 'rule', 'exp-amount', _BK + 'exp_amount_zero / '),
    'rule_exp_at': ('record_expense', 'rule', 'exp-at', _BK + 'exp_at_future / '),
    'rule_exp_replay_conflict': ('record_expense', 'rule', 'exp-replay-conflict', _BK + 'exp_replay_other_body / '),
    'rule_exp_reserved': ('record_expense', 'rule', 'exp-reserved', _BK + 'exp_reserved_category / '),
    'rule_draw_keys': ('record_draw', 'rule', 'draw-keys', _BK + 'draw_keys_missing / '),
    'rule_draw_id': ('record_draw', 'rule', 'draw-id', _BK + 'draw_id_bad / '),
    'rule_draw_amount': ('record_draw', 'rule', 'draw-amount', _BK + 'draw_amount_zero / '),
    'rule_draw_at': ('record_draw', 'rule', 'draw-at', _BK + 'draw_at_future / '),
    'rule_draw_replay_conflict': ('record_draw', 'rule', 'draw-replay-conflict', _BK + 'draw_replay_other_body / '),
    'text_draw_not_expense': ('get_books', 'text', ("l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and", "l.kind in ('cost', 'adjustment') and"),
                              _BKC + 'draw_is_not_an_expense'),
    'rule_cor_keys': ('record_cost_correction', 'rule', 'cor-keys', _BK + 'cor_keys_missing / '),
    'rule_cor_id': ('record_cost_correction', 'rule', 'cor-id', _BK + 'cor_id_bad / '),
    'rule_cor_cost': ('record_cost_correction', 'rule', 'cor-cost', _BK + 'cor_cost_negative / '),
    'rule_cor_at': ('record_cost_correction', 'rule', 'cor-at', _BK + 'cor_at_future / '),
    'rule_cor_replay_conflict': ('record_cost_correction', 'rule', 'cor-replay-conflict', _BK + 'cor_replay_other_body / '),
    'rule_cor_movement_missing': ('record_cost_correction', 'rule', 'cor-movement-missing', _BK + 'cor_movement_missing / '),
    'rule_cor_not_costed': ('record_cost_correction', 'rule', 'cor-not-costed', _BK + 'cor_not_a_costed_receipt / '),
    'rule_cor_no_change': ('record_cost_correction', 'rule', 'cor-no-change', _BK + 'cor_no_change / '),
    'rule_basis_value': ('set_cost_basis', 'rule', 'basis-value', _BK + 'basis_bad / '),
    'rule_books_period': ('get_books', 'rule', 'books-period', _BK + 'books_period_reversed / '),
    'text_bought_has_no_use_cost': ('get_books', 'text', ("where v_basis = 'used' and m.kind in ('use', 'waste')", "where m.kind in ('use', 'waste')"),
                                    _BKC + 'books_bought_expenses'),
    'text_last_paid_corrected': ('get_last_paid', 'text', ('public.receipt_cost(m.id) as cost_cents', 'm.cost_cents as cost_cents'),
                                 _BKC + 'last_paid_uses_the_corrected_cost'),
    'text_price_latest_receipt': ('get_books', 'text', (_LINE_Q, "round((v_used -> m.id::text ->> 'q')::numeric * 10)"),
                                  _BKC + 'used_excludes_receipts_and_prices_use'),
    'text_correction_saved_order': ('receipt_cost', 'text', ('order by c.received_at desc, c.id desc limit 1', 'order by c.at desc, c.received_at desc limit 1'),
                                    _BKC + 'cor_latest_is_the_one_saved_last'),
    'text_period_exclusive': ('get_books', 'text', ('o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0', 'o.paid_at >= p_from and o.paid_at <= p_to and o.paid_cents > 0'),
                              _BKC + 'books_period_upper_bound_exclusive'),
    'text_stamp_paid': ('orders_books_stamp', 'text', ('if new.paid_cents is not null and old.paid_cents is null and new.paid_at is null then', 'if false then'),
                        _BKC + 'trigger_stamps_paid_at'),
    'text_stamp_refunded': ('orders_books_stamp', 'text', ("if new.pay_state = 'refunded' and old.pay_state is distinct from 'refunded' and new.refunded_at is null then", 'if false then'),
                            _BKC + 'trigger_stamps_refunded_at'),
    'text_correction_sign': ('record_cost_correction', 'text', ('v_now - v_cost::bigint,', 'v_cost::bigint - v_now,'),
                             _BKC + 'cor_lowers_the_cost_by_the_difference'),
}
BOOKS_TABLE_MUTATIONS = {
    'settings_table_select': ('grant select on public.books_settings to anon;', 'books outcome differs: anon / settings_select / '),
}
# B3b: the cost cutover by apply order and by value (cost-cutover.sql), acting on the last migration that defines each function (20260101006300). No
# refusal was added, so there is no `-- rule:` line to neutralise: every changed clause of get_books and set_cost_basis is one text change
# here, and the named case must fail. The money is worked by hand in the suite. Not mutation-tested (one session cannot observe a lock):
# the catalogue and item locks set_cost_basis takes before it reads the highest seq and the stock on hand. Not listed (equivalent): the
# `v_used ? m.id::text` guards of the line and uncosted arms, which the period test on the same expensed date already implies.
_CUO = 'cutover outcome differs: active_owner / '
_CUC = 'cutover check differs: active_owner / '
_LATE_USE = 'v_at := case when v_cut is null then v_e.at else greatest(v_e.at, v_used_from) end;'
_LATE_COR = '(case when v_cut is null then c.at else greatest(c.at, v_used_from) end), 0'
_LATE_BAKE = "(case when v_cut is null then r.at else greatest(r.at, v_used_from) end), e.value ->> 'why'"
CUTOVER_MUTATIONS = {
    'text_cut_ledger_delivery_by_date': ('get_books', 'text', ('m.ledger_id = l.id and m.seq <= v_cut', 'm.ledger_id = l.id and m.at < v_used_from'),
                                         _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_ledger_delivery_line_always': ('get_books', 'text', ('m.ledger_id = l.id and m.seq <= v_cut', 'm.ledger_id = l.id'),
                                             _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_ledger_delivery_line_never': ('get_books', 'text', ('m.ledger_id = l.id and m.seq <= v_cut', 'm.ledger_id = l.id and false'),
                                            _CUC + 'cut_nothing_is_expensed_at_the_cutover'),
    'text_cut_ledger_correction_line_never': ('get_books', 'text', ('where c.ledger_id = l.id and r.seq <= v_cut', 'where c.ledger_id = l.id and false'),
                                              _CUC + 'cut_correction_of_an_earlier_delivery_counts_in_full'),
    'text_cut_ledger_correction_line_always': ('get_books', 'text', ('where c.ledger_id = l.id and r.seq <= v_cut', 'where c.ledger_id = l.id'),
                                               _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_ledger_unlinked_line': ('get_books', 'text', ('(v_cut is not null\n                  and (exists', '(false\n                  and (exists'),
                                      _CUC + 'cut_nothing_is_expensed_at_the_cutover'),
    'text_cut_correction_share_of_an_earlier_delivery': ('get_books', 'text',
                                                         ('and (v_cut is null or r.seq > v_cut) -- B3b cutover', 'and true -- B3b cutover'),
                                                         _CUC + 'cut_correction_of_an_earlier_delivery_counts_in_full'),
    'text_cut_correction_share_of_a_later_delivery': ('get_books', 'text',
                                                      ('and (v_cut is null or r.seq > v_cut) -- B3b cutover', 'and (v_cut is null or r.seq < 0) -- B3b cutover'),
                                                      _CUC + 'cut_correction_of_a_later_delivery_is_cost_used'),
    'text_cut_stock_applied_by_the_cutover': ('get_books', 'text', ("where (v_cut is null or m.seq > v_cut) and m.kind <> 'receipt'", "where true and m.kind <> 'receipt'"),
                                              _CUC + 'cut_nothing_is_expensed_at_the_cutover'),
    'text_cut_snapshot_is_an_allowance': ('get_books', 'text', ('v_va := v_qty0 * v_c;', 'v_va := 0;'),
                                          _CUC + 'cut_offline_use_dated_before_the_cutover_is_drawn_from_the_allowance'),
    'text_cut_snapshot_is_a_quantity_without_a_cost': ('get_books', 'text', ('v_qa := coalesce(v_qty0, 0);', 'v_qa := 0;'),
                                                       _CUC + 'cut_uncosted_lists_only_what_was_expensed'),
    'text_cut_opening_after_adds': ('get_books', 'text', ('v_qa := v_qa + v_e.qty_delta;', 'null;'), _CUC + 'cut_uncosted_lists_only_what_was_expensed'),
    'text_cut_opening_before_does_not_add': ('get_books', 'text', ("elsif v_e.kind = 'opening' then\n      if v_cut is not null then", "elsif v_e.kind = 'opening' then\n      if true then"),
                                             _CUC + 'cut_none_means_no_cutover_uncosted'),
    'text_cut_allowance_in_seq_order': ('get_books', 'text', ('order by x.item_id, x.seq, x.ord', 'order by x.item_id, x.at, x.ord'),
                                        _CUC + 'cut_allowance_is_consumed_in_seq_order'),
    'text_cut_allowance_is_drawn_down': ('get_books', 'text',
                                         ('v_va := v_va - v_cv;\n      end if;\n      if v_e.stamp is not null then', 'null;\n      end if;\n      if v_e.stamp is not null then'),
                                         _CUC + 'cut_allowance_is_consumed_in_seq_order'),
    'text_cut_covered_is_at_most_taken': ('get_books', 'text', ('v_cv := least(v_t * v_rate,', 'v_cv := greatest(v_t * v_rate,'),
                                          _CUC + 'cut_stock_removed_by_a_count_is_no_allowance'),
    'text_cut_short_is_never_covered': ('get_books', 'text', ('+ v_e.short_qty * v_e.stamp +', '+ 0 * v_e.stamp +'),
                                        _CUC + 'cut_offline_use_dated_before_the_cutover_is_drawn_from_the_allowance'),
    'text_cut_short_is_never_covered_uncosted': ('get_books', 'text', ('v_units := v_units - v_part + v_e.short_qty;', 'v_units := v_units - v_part;'),
                                                 _CUC + 'cut_uncosted_lists_only_what_was_expensed'),
    'text_cut_count_draws_the_allowance': ('get_books', 'text', ('elsif v_e.qty_delta < 0 then', 'elsif false then'),
                                           _CUC + 'cut_stock_removed_by_a_count_is_no_allowance'),
    'text_cut_no_allowance_without_a_cutover': ('get_books', 'text', ('if v_cut is not null then\n        select b.qty', 'if true then\n        select b.qty'),
                                                _CUC + 'cut_none_means_no_cutover_lines'),
    'text_cut_line_is_the_part_expensed': ('get_books', 'text', (_LINE_Q, 'round(-m.qty_delta * m.unit_cost)'),
                                           _CUC + 'cut_offline_use_dated_before_the_cutover_is_drawn_from_the_allowance'),
    'text_cut_late_use_is_dated_at_the_cutover': ('get_books', 'text', (_LATE_USE, 'v_at := v_e.at;'), _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    # B3b by value (20260101006300): what was on hand at the cutover is an allowance of VALUE, and each part of its rule is one text change here.
    'text_cutval_covered_by_value_not_units': ('get_books', 'text', ('v_val := v_t * v_e.stamp - greatest(v_cv, 0);', 'v_val := greatest(v_t - v_cv / coalesce(v_c, 1), 0) * v_e.stamp;'),
                                               _CUC + 'cut_use_beyond_the_allowance_is_expensed_in_part'),
    'text_cutval_count_up_gives_back': ('get_books', 'text', ('v_cv := least(v_units * v_c, v_va_taken);', 'v_cv := 0;'),
                                        _CUC + 'cutval_a_count_back_up_gives_the_allowance_back'),
    'text_cutval_count_up_gives_back_no_more_than_taken': ('get_books', 'text', ('v_cv := least(v_units * v_c, v_va_taken);', 'v_cv := v_units * v_c;'),
                                                           _CUC + 'cutval_a_count_up_gives_back_no_more_than_the_downs_took'),
    'text_cutval_down_remembers_what_it_took': ('get_books', 'text', ('v_va_taken := v_va_taken + v_cv;', 'null;'),
                                                _CUC + 'cutval_a_count_back_up_gives_the_allowance_back'),
    'text_cutval_down_takes_the_cutover_cost': ('get_books', 'text', ('v_cv := greatest(0, least(v_units * v_c, v_va));', 'v_cv := 0;'),
                                                _CUC + 'cut_stock_removed_by_a_count_is_no_allowance'),
    'text_cutval_quantity_count_up_gives_back': ('get_books', 'text', ('v_part := least(v_units, v_qa_taken);', 'v_part := 0;'),
                                                 _CUC + 'cutval_a_count_back_up_gives_a_quantity_allowance_back'),
    'text_cutval_quantity_down_remembers': ('get_books', 'text', ('v_qa_taken := v_qa_taken + v_part;', 'null;'),
                                            _CUC + 'cutval_a_count_back_up_gives_a_quantity_allowance_back'),
    'text_cutval_correction_moves_the_allowance': ('get_books', 'text', ('v_va := v_va + v_e.share;', 'null;'),
                                                   _CUC + 'cutval_a_correction_of_an_earlier_delivery_moves_the_allowance'),
    'text_cutval_correction_share_is_the_stock_on_hand': ('get_books', 'text', ('- c.used_cents)::numeric', ')::numeric'),
                                                          _CUC + 'cutval_mixed_history_costs_what_was_bought'),
    'text_cutval_correction_after_the_cutover_only': ('get_books', 'text', ('where v_cut is not null and c.seq > v_cut and rc.seq <= v_cut', 'where v_cut is not null and rc.seq <= v_cut'),
                                                      _CUC + 'cutval_a_correction_before_the_cutover_is_in_the_snapshot'),
    'text_cutval_correction_of_a_delivery_applied_by_the_cutover_only': ('get_books', 'text',
                                                                         ('where v_cut is not null and c.seq > v_cut and rc.seq <= v_cut', 'where v_cut is not null and c.seq > v_cut'),
                                                                         _CUC + 'cutval_a_correction_of_a_later_delivery_does_not_move_the_allowance'),
    'text_cutval_correction_is_ordered_by_its_seq': ('get_books', 'text', ('select rc.item_id, c.seq, 1,', 'select rc.item_id, c.seq + 1000000000, 1,'),
                                                     _CUC + 'cutval_a_correction_of_an_earlier_delivery_moves_the_allowance'),
    'text_cutval_a_debt_is_expensed': ('get_books', 'text', ('+ greatest(- v_cv, 0); -- what was short', '+ 0; -- what was short'),
                                       _CUC + 'cutval_a_correction_after_the_allowance_is_used_is_expensed_later'),
    'text_cutval_a_use_with_no_stamp_draws_at_the_cutover_cost': ('get_books', 'text', ('v_rate := coalesce(v_e.stamp, v_c);', 'v_rate := coalesce(v_e.stamp, 1000000);'),
                                                                  _CUC + 'cutval_a_use_with_no_cost_draws_the_allowance_at_the_cutover_cost'),
    'text_cutval_snapshot_keeps_the_cost': ('set_cost_basis', 'text', ('(select u.unit_cost from public.item_unit_cost(i.id) u) from public.inventory_items i;', 'null from public.inventory_items i;'),
                                            _CUC + 'cutval_snapshot_takes_the_cost_per_unit'),
    'text_cutval_order_mark_counts_the_corrections': ('set_cost_basis', 'text', ('coalesce((select max(c.seq) from public.stock_cost_corrections c), 0))', '0)'),
                                                      _CUC + 'cutval_a_correction_before_the_cutover_is_in_the_snapshot'),
    'text_cut_late_use_period_end_inclusive': ('get_books', 'text',
                                               ("::timestamptz >= p_from and (v_used -> m.id::text ->> 'at')::timestamptz < p_to",
                                                "::timestamptz >= p_from and (v_used -> m.id::text ->> 'at')::timestamptz <= p_to"),
                                               _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_late_uncosted_period_end_inclusive': ('get_books', 'text',
                                                    ("\n         and (v_used -> m.id::text ->> 'at')::timestamptz < p_to", "\n         and (v_used -> m.id::text ->> 'at')::timestamptz <= p_to"),
                                                    _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_correction_is_dated_at_the_cutover': ('get_books', 'text', (_LATE_COR, 'c.at, 0'), _CUC + 'cut_correction_is_never_dated_before_the_cutover'),
    'text_cut_correction_period_end': ('get_books', 'text', ('else greatest(c.at, v_used_from) end) < p_to', 'else c.at end) < p_to'),
                                       _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_bake_is_dated_at_the_cutover': ('get_books', 'text', (_LATE_BAKE, "r.at, e.value ->> 'why'"),
                                          _CUC + 'cut_uncosted_bake_is_dated_no_earlier_than_the_cutover'),
    'text_cut_bake_period_end': ('get_books', 'text', ('else greatest(r.at, v_used_from) end) < p_to', 'else r.at end) < p_to'),
                                 _CUC + 'cut_past_period_is_unchanged_by_what_follows'),
    'text_cut_bake_by_its_movements': ('get_books', 'text',
                                       ('or exists (select 1 from public.stock_movements s where s.production_id = r.id and s.seq > v_cut)', 'or false'),
                                       _CUC + 'cut_uncosted_lists_only_what_was_expensed'),
    'text_cut_bake_without_movements_by_receipt': ('get_books', 'text', ('and r.received_at >= v_used_from)', 'and false)'),
                                                   _CUC + 'cut_uncosted_lists_only_what_was_expensed'),
    'text_cut_bake_before_the_cutover': ('get_books', 'text',
                                         ('or (not exists (select 1 from public.stock_movements s where s.production_id = r.id) and', 'or (true and'),
                                         _CUC + 'cut_nothing_is_expensed_at_the_cutover'),
    'text_cut_output_says_where_it_starts': ('get_books', 'text',
                                             ("'used_from', case when v_used_from is null then null else (extract(epoch from v_used_from) * 1000)::bigint end",
                                              "'used_from', null"),
                                             _CUC + 'cut_books_report_the_cutover'),
    'text_cut_switch_only_the_first_choice': ('set_cost_basis', 'text', ("select b.used_from is null into v_first", "select b.cost_basis = 'bought' into v_first"),
                                              _CUC + 'cut_second_switch_keeps_the_first_cutover'),
    'text_cut_switch_only_to_used': ('set_cost_basis', 'text', ("v_first := v_first and p_basis = 'used';", 'v_first := v_first;'),
                                     _CUC + 'basis_bought_before_the_first_choice_takes_no_cutover'),
    'text_cut_switch_once': ('set_cost_basis', 'text', ("v_first := v_first and p_basis = 'used';", "v_first := p_basis = 'used';"),
                             _CUC + 'basis_used_to_used_keeps_the_cutover'),
    'text_cut_switch_takes_a_new_date': ('set_cost_basis', 'text', ('used_from = case when v_first then now() else b.used_from end', 'used_from = b.used_from'),
                                         _CUC + 'cut_first_choice_takes_the_cutover_date'),
    'text_cut_switch_takes_the_order_mark': ('set_cost_basis', 'text',
                                             ('used_from_seq = case when v_first then greatest(', 'used_from_seq = case when false then greatest('),
                                             _CUC + 'cut_first_choice_takes_the_order_mark'),
    'text_cut_switch_order_mark_is_the_highest_seq': ('set_cost_basis', 'text', ('coalesce((select max(m.seq) from', 'coalesce((select min(m.seq) from'),
                                                      _CUC + 'cut_first_choice_takes_the_order_mark'),
    'text_cut_switch_takes_a_snapshot': ('set_cost_basis', 'text', ('if v_first then\n', 'if false then\n'),
                                         _CUC + 'cut_first_choice_takes_the_snapshot'),
    'text_cut_switch_replaces_the_snapshot': ('set_cost_basis', 'text', ('delete from public.books_cutover c where true;', 'null;'),
                                              _CUO + 'switch_first_used / '),
    'text_cut_snapshot_is_what_is_on_hand': ('set_cost_basis', 'text',
                                             ('greatest(i.on_hand, 0), (select u.unit_cost', '0, (select u.unit_cost'),
                                             _CUC + 'cut_first_choice_takes_the_snapshot'),
}
CUTOVER_TABLE_MUTATIONS = {
    'cutover_table_anon_select': ('grant select on public.books_cutover to anon;', 'cutover outcome differs: anon / cutover_select / '),
    'cutover_table_authenticated_select': ('grant select on public.books_cutover to authenticated;', 'cutover outcome differs: active_helper / cutover_select / '),
    'cutover_table_rls_off': ('alter table public.books_cutover disable row level security;', _CUC + 'cut_table_has_no_api_grant_and_rls_on'),
}
# B3a: the cost core (item-costs.sql), acting on the last migration that defines each function. The money cases are worked by hand in the suite.
_CS = 'item cost outcome differs: active_owner / '
_CSC = 'item cost check differs: active_owner / '
COST_MUTATIONS = {
    'rule_itemprice_keys': ('save_item_price', 'rule', 'itemprice-keys', _CS + 'ip_keys_missing / '),
    'rule_itemprice_id': ('save_item_price', 'rule', 'itemprice-id', _CS + 'ip_id_bad / '),
    'rule_itemprice_cents': ('save_item_price', 'rule', 'itemprice-cents', _CS + 'ip_cents_zero / '),
    'rule_itemprice_pack': ('save_item_price', 'rule', 'itemprice-pack', _CS + 'ip_pack_zero / '),
    'rule_itemprice_date': ('save_item_price', 'rule', 'itemprice-date', _CS + 'ip_date_format / '),
    'rule_itemprice_future': ('save_item_price', 'rule', 'itemprice-future', _CS + 'ip_date_future / '),
    'rule_itemprice_replay_conflict': ('save_item_price', 'rule', 'itemprice-replay-conflict', _CS + 'ip_replay_other_body / '),
    'rule_itemprice_item_missing': ('save_item_price', 'rule', 'itemprice-item-missing', _CS + 'ip_item_missing / '),
    'text_cost_average_formula': ('record_stock_movement', 'text',
                                  ('v_avg := (v_item.on_hand * v_base + v_cost) / (v_item.on_hand + v_qty);', 'v_avg := v_cost / v_qty;'),
                                  _CSC + 'cost_a_stamps'),
    'text_cost_average_first': ('item_unit_cost', 'text', ("'average'::text as src, 1 as ord", "'average'::text as src, 4 as ord"),
                                _CSC + 'cost_order_average_first'),
    'text_cost_usual_before_supplier': ('item_unit_cost', 'text', ("'usual'::text, 2", "'usual'::text, 4"),
                                        _CSC + 'cost_order_usual_before_supplier'),
    'text_cost_correction_share': ('record_cost_correction', 'text', ('v_f := least(1, greatest(0, v_f * v_h_after / v_h_before));', 'v_f := v_f;'),
                                   _CSC + 'cost_d_average_and_used'),
    'text_cost_used_line_counts_the_short': ('get_books', 'text',
                                             (_LINE_Q, 'round(-m.qty_delta * m.unit_cost)'),
                                             _CSC + 'cost_c_line'),
    'text_cost_correction_counts_only_use_waste': ('record_cost_correction', 'text',
                                                   ('if v_mv.qty_delta < 0 then', "if v_mv.kind in ('use', 'waste') and v_mv.qty_delta < 0 then"),
                                                   _CSC + 'cost_g1_count_scales_the_share'),
    'text_cost_correction_f_starts_at_one': ('record_cost_correction', 'text', ('v_f numeric := 1;', 'v_f numeric := 0;'),
                                             _CSC + 'cost_d_average_and_used'),
    'text_cost_correction_applied_order': ('record_cost_correction', 'text',
                                           ('m.seq > v_m.seq order by m.seq desc', 'm.at > v_m.at order by m.at desc'),
                                           _CSC + 'cost_h5_applied_order_not_dated_order'),
    'text_cost_correction_drops_a_dead_average': ('record_cost_correction', 'text', ('if v_new_avg > 0 then', 'if true then'),
                                                  _CS + 'h1_correct / 23514'),
    'text_cost_correction_nothing_on_hand': ('record_cost_correction', 'text',
                                             ('v_stock.on_hand > 0 and v_stock.avg_cost is not null', 'v_stock.avg_cost is not null'),
                                             _CS + 'h2_correct / 22012'),
    'text_cost_correction_no_average': ('record_cost_correction', 'text',
                                        ('v_stock.on_hand > 0 and v_stock.avg_cost is not null', 'v_stock.on_hand > 0'),
                                        _CSC + 'cost_h3_no_average_all_used'),
    'text_cost_uncosted_production_arm': ('get_books', 'text', ("(e.value ? 'why')", 'false'),
                                          _CSC + 'cost_u_uncosted_lists_the_lines_not_taken'),
    'text_cost_waste_is_stamped': ('record_stock_movement', 'text',
                                   ("if v_kind = 'waste' then\n    select c.unit_cost, c.source into v_ucost, v_usrc",
                                    "if false then\n    select c.unit_cost, c.source into v_ucost, v_usrc"),
                                   _CSC + 'cost_e_stamps'),
    'text_cost_base_falls_back_to_usual': ('record_stock_movement', 'text', ('if v_base is null and v_item.on_hand > 0 then', 'if false then'),
                                           _CSC + 'cost_b4_first_costed_delivery'),
    'text_cost_uncosted_is_not_a_line': ('get_books', 'text',
                                         ("where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null",
                                          "where v_basis = 'used' and m.kind in ('use', 'waste')"),
                                         _CSC + 'cost_b3_is_never_a_line'),
}
# B3a: batch corrections (batch-correction.sql), acting on the last migration that defines each function. The money cases are worked by
# hand in the suite. Not mutation-tested (one session cannot observe a lock): the two advisory locks of record_batch_correction.
_BCO = 'correction outcome differs: active_owner / '
_BCC = 'correction check differs: active_owner / '
_BCB = 'record_batch_correction'
BATCH_CORRECTION_MUTATIONS = {
    'rule_corr_keys': (_BCB, 'rule', 'corr-keys', _BCO + 'corr_keys_extra / '),
    'rule_corr_id': (_BCB, 'rule', 'corr-id', _BCO + 'corr_id_bad / '),
    'rule_corr_qty': (_BCB, 'rule', 'corr-qty', _BCO + 'corr_qty_over / '),
    'rule_corr_rejects': (_BCB, 'rule', 'corr-rejects', _BCO + 'corr_rejects_over / '),
    'rule_corr_reason': (_BCB, 'rule', 'corr-reason', _BCO + 'corr_reason_blank / '),
    'rule_corr_at': (_BCB, 'rule', 'corr-at', _BCO + 'corr_at_future / '),
    'rule_corr_replay_conflict': (_BCB, 'rule', 'corr-replay-conflict', _BCO + 'corr_replay_other_body / '),
    'rule_corr_batch_missing': (_BCB, 'rule', 'corr-batch-missing', _BCO + 'corr_batch_missing / '),
    'rule_corr_no_change': (_BCB, 'rule', 'corr-no-change', _BCO + 'corr_no_change / '),
    'rule_corr_baked_negative': (_BCB, 'rule', 'corr-baked-negative', _BCO + 'corr_down_below_packed / '),
    'text_corr_delta_from_effective': (_BCB, 'text',
        ('select v_batch.qty + coalesce(sum(c.qty_delta), 0), v_batch.rejects + coalesce(sum(c.rejects_delta), 0) into v_eff_q, v_eff_r',
         'select v_batch.qty + 0 * coalesce(sum(c.qty_delta), 0), v_batch.rejects + 0 * coalesce(sum(c.rejects_delta), 0) into v_eff_q, v_eff_r'),
        _BCC + 'corr_down_effective'),
    'text_corr_opposite_entry': (_BCB, 'text', ('v_batch.id, v_qty::integer - v_eff_q, v_rej::integer - v_eff_r);', 'v_batch.id, v_eff_q - v_qty::integer, v_rej::integer - v_eff_r);'),
        _BCC + 'corr_up_writes_one_row'),
    'text_corr_copies_the_drop': (_BCB, 'text', ('v_batch.recipe_version, v_batch.drop_no, v_at,', 'v_batch.recipe_version, 0, v_at,'),
        _BCC + 'corr_up_writes_one_row'),
    'text_corr_audit_row': (_BCB, 'text', ("'production.batch_correction', 'production_records'", "'production.batch_corrected', 'production_records'"),
        _BCC + 'corr_up_one_audit_row'),
    'text_corr_replay_returns_effective': (_BCB, 'text',
        ('select b.qty + coalesce(sum(c.qty_delta), 0)::integer, b.rejects + coalesce(sum(c.rejects_delta), 0)::integer into v_eff_q, v_eff_r',
         'select b.qty + 0 * coalesce(sum(c.qty_delta), 0)::integer, b.rejects + 0 * coalesce(sum(c.rejects_delta), 0)::integer into v_eff_q, v_eff_r'),
        _BCC + 'corr_replay_is_duplicate'),
    'text_corr_balance_counts_packed': (_BCB, 'text',
        ('select -oi.qty from public.production_records r join public.order_items oi on oi.order_id = r.ref',
         'select 0 from public.production_records r join public.order_items oi on oi.order_id = r.ref'),
        _BCO + 'corr_down_below_packed / '),
    'text_corr_balance_counts_discards': (_BCB, 'text',
        ("where r.kind = 'discard_baked' and r.product_id = v_batch.product_id", "where r.kind = 'discard_baked' and false and r.product_id = v_batch.product_id"),
        _BCO + 'corr_down_below_discarded / '),
    'text_corr_balance_counts_corrections': (_BCB, 'text',
        ("where r.kind = 'batch_correction' and r.product_id = v_batch.product_id", "where r.kind = 'batch_correction' and false and r.product_id = v_batch.product_id"),
        _BCO + 'corr_down_below_discarded / '),
    'text_corr_up_never_refused': (_BCB, 'text',
        ('v_bad := v_qty < v_eff_q and v_have + (v_qty - v_eff_q) < 0;', 'v_bad := v_have + (v_qty - v_eff_q) < 0;'),
        _BCO + 'corr_up_when_negative_ok / '),
    'text_corr_effective_qty': ('get_production', 'text', ("'qty', b.qty + b.dq", "'qty', b.qty"), _BCC + 'corr_up_batch_list'),
    'text_corr_effective_rejects': ('get_production', 'text', ("'rejects', b.rejects + b.dr", "'rejects', b.rejects"), _BCC + 'corr_down_effective'),
    'text_corr_corrected_flag': ('get_production', 'text', ("'corrected', b.n_corr > 0", "'corrected', false"), _BCC + 'corr_up_batch_list'),
    'text_corr_baked_read': ('get_production', 'text', ('select r.product_id, r.qty_delta from', 'select r.product_id, 0 from'), _BCC + 'corr_baked_follows'),
    'text_corr_discard_balance': ('record_discard', 'text', ('select r.qty_delta from public.production_records r', 'select 0 from public.production_records r'),
        _BCO + 'corr_disc_after_down / '),
    'text_corr_per_cookie_effective': ('get_production', 'text', ('round(c.cost / (b.qty + b.dq), 4)', 'round(c.cost / b.qty, 4)'), _BCC + 'corr_up_cost'),
    'text_corr_per_cookie_zero': ('get_production', 'text', ('case when b.qty + b.dq > 0 then', 'case when true then'), 'division by zero'),
    'text_corr_cost_counts_the_short': ('get_production', 'text', ('(-m.qty_delta + m.short_qty) * m.unit_cost', '-m.qty_delta * m.unit_cost'),
        _BCC + 'corr_cost_counts_the_short'),
    'text_corr_cost_dough_counts_the_short': ('get_production', 'text', ('(m.short_qty - m.qty_delta) * m.unit_cost', '-m.qty_delta * m.unit_cost'),
        _BCC + 'corr_cost_dough_counts_the_short'),
    'text_corr_cost_adds_the_dough': ('get_production', 'text', ('own.cents + b.dough_used * case', 'own.cents + 0 * case'), _BCC + 'corr_d_cost_draws_dough'),
    'text_corr_cost_dough_precedes': ('get_production', 'text', ('d.at <= b.at) dough', 'true) dough'), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_cost_null_when_unknown': ('get_production', 'text',
        ('case when own.n_costed > 0 or (b.dough_used > 0 and dough.n_costed > 0) then', 'case when true then'), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_complete_unpriced': ('get_production', 'text', ('not own.unpriced and not own.why', 'not own.why'), _BCC + 'corr_cost_uncosted_movement'),
    'text_corr_complete_why': ('get_production', 'text', ('not own.unpriced and not own.why', 'not own.unpriced'), _BCC + 'corr_cost_line_not_a_stock_item'),
    'text_corr_complete_dough_why': ('get_production', 'text', ('not dough.unpriced and not dough.why', 'not dough.unpriced'), _BCC + 'corr_cost_dough_line_not_costed'),
    'text_corr_complete_dough_record': ('get_production', 'text', ('dough.n > 0 and dough.balls > 0 and ', ''), _BCC + 'corr_cost_dough_after_batch'),
    'text_corr_complete_legacy_short': ('get_production', 'text', ('jsonb_array_length(b.short) > count(*) filter (where m.short_qty > 0)', "exists (select 1 from jsonb_array_elements(b.short) e where e ? 'why')"), _BCC + 'corr_cost_legacy_short_not_complete'),
}
# B3b: packaging as records (packaging.sql), acting on the last migration that defines each function. The movements and the money are
# worked by hand in the suite.
_PK = 'packaging outcome differs: active_owner / '
_PKC = 'packaging check differs: active_owner / '
_SPR = 'save_packaging_rules'
_SRP = 'save_recipe_packaging'
PACKAGING_MUTATIONS = {
    'rule_rules_size': (_SPR, 'rule', 'rules-size', _PK + 'pk_rules_size_81 / '),
    'rule_rule_keys': (_SPR, 'rule', 'rule-keys', _PK + 'pk_rule_keys_extra / '),
    'rule_rule_types': (_SPR, 'rule', 'rule-types', _PK + 'pk_rule_type_qty_string / '),
    'rule_rule_container': (_SPR, 'rule', 'rule-container', _PK + 'pk_rule_container_unknown / '),
    'rule_rule_box_size': (_SPR, 'rule', 'rule-box-size', _PK + 'pk_rule_box_size_missing / '),
    'rule_rule_qty': (_SPR, 'rule', 'rule-qty', _PK + 'pk_rule_qty_zero / '),
    'rule_rule_per': (_SPR, 'rule', 'rule-per', _PK + 'pk_rule_per_unknown / '),
    'rule_rules_duplicate': (_SPR, 'rule', 'rules-duplicate', _PK + 'pk_rule_duplicate / '),
    'rule_rules_item_missing': (_SPR, 'rule', 'rules-item-missing', _PK + 'pk_rule_item_missing / '),
    'rule_rules_noop': (_SPR, 'rule', 'rules-noop', _PK + 'pk_rules_retry_answered / '),
    'rule_rules_stale': (_SPR, 'rule', 'rules-stale', _PK + 'pk_rules_stale_without_state / '),
    'rule_pkg_keys': (_SRP, 'rule', 'pkg-keys', _PK + 'pk_pkg_keys_extra / '),
    'rule_pkg_types': (_SRP, 'rule', 'pkg-types', _PK + 'pk_pkg_type_product / '),
    'rule_pkg_size': (_SRP, 'rule', 'pkg-size', _PK + 'pk_pkg_size_81 / '),
    'rule_pkg_line_keys': (_SRP, 'rule', 'pkg-line-keys', _PK + 'pk_pkg_line_keys_extra / '),
    'rule_pkg_line_types': (_SRP, 'rule', 'pkg-line-types', _PK + 'pk_pkg_line_type_qty / '),
    'rule_pkg_qty': (_SRP, 'rule', 'pkg-qty', _PK + 'pk_pkg_qty_zero / '),
    'rule_pkg_duplicate': (_SRP, 'rule', 'pkg-duplicate', _PK + 'pk_pkg_duplicate / '),
    'rule_pkg_recipe_missing': (_SRP, 'rule', 'pkg-recipe-missing', _PK + 'pk_pkg_recipe_missing / '),
    'rule_pkg_item_missing': (_SRP, 'rule', 'pkg-item-missing', _PK + 'pk_pkg_item_missing / '),
    'rule_pkg_noop': (_SRP, 'rule', 'pkg-noop', _PKC + 'pk_pkg_noop_makes_no_version'),
    'rule_pkg_stale': (_SRP, 'rule', 'pkg-stale', _PK + 'pk_pkg_stale_old_stamp / '),
    'text_rules_positions_follow_the_container': (_SPR, 'text',
        ("partition by r.value ->> 'container', r.value ->> 'box_size' order by r.ord", "partition by r.value ->> 'container' order by r.ord"),
        _PKC + 'pk_rules_read_back_in_order'),
    'text_pack_boxes_capped_at_the_cookies': ('record_pack', 'text',
        ('v_inbox := least(v_s.qty * v_s.size, v_rest);', 'v_inbox := v_s.qty * v_s.size;'), _PKC + 'pk_pack_two_sizes_capped_movements'),
    'text_pack_smallest_box_first': ('record_pack', 'text',
        ('group by b.size order by b.size loop', 'group by b.size order by b.size desc loop'), _PKC + 'pk_pack_two_sizes_capped_movements'),
    'text_pack_loose_is_its_own_container': ('record_pack', 'text', ('u.qty * v_loose', 'u.qty'), _PKC + 'pk_pack_two_sizes_capped_movements'),
    'text_pack_order_rule_per_cookie': ('record_pack', 'text',
        ("u.qty * case u.per when 'container' then 1 else v_count end", 'u.qty'), _PKC + 'pk_pack_two_sizes_capped_movements'),
    'text_pack_never_costs_the_short': ('record_pack', 'text', ('v_at, false)', 'v_at, true)'), _PKC + 'pk_pack_short_stock_is_a_shortfall'),
    'text_pack_flavour_lines_are_per_cookie': ('record_pack', 'text', ('r.qty * f.qty as amount', 'r.qty as amount'), _PKC + 'pk_pack_two_sizes_capped_movements'),
    'text_sale_rule_per_cookie': ('record_sale_packaging', 'text',
        ("u.qty * case u.per when 'container' then 1 else p_cookies end", 'u.qty'), _PKC + 'pk_sale_flavour_lines_then_rules'),
    'text_sale_flavour_lines_are_per_cookie': ('record_sale_packaging', 'text',
        ('r.qty * f.qty as amount', 'r.qty as amount'), _PKC + 'pk_sale_flavour_lines_then_rules'),
    'text_sale_no_rule_counts_the_cookies': ('record_sale_packaging', 'text',
        ("jsonb_build_object('name', 'packaging rule', 'by', p_cookies,", "jsonb_build_object('name', 'packaging rule', 'by', 0,"),
        _PKC + 'pk_sale_without_rules_says_so'),
    'text_cost_adds_the_packaging': ('get_recipe_costs', 'text',
        ('round(coalesce(t.batch / r.yield_count, 0) + coalesce(t.pack, 0), 4)', 'round(coalesce(t.batch / r.yield_count, 0), 4)'),
        _PKC + 'pk_costs_worked_recipe'),
    'text_cost_unknown_is_null_never_zero': ('get_recipe_costs', 'text',
        ('case when t.batch is null and t.pack is null then null', 'case when false then null'), _PKC + 'pk_costs_nothing_costed_is_null'),
    'text_bake_takes_ingredients_only': ('record_production', 'text',
        ("where i.product_id = v_pid and i.kind = 'ingredient' order by i.position, i.id loop", 'where i.product_id = v_pid order by i.position, i.id loop'),
        _PKC + 'pk_bake_takes_only_ingredients'),
    'text_bake_adjusts_ingredients_only': ('record_production', 'text',
        ("and i.kind = 'ingredient' and i.item_name = k", 'and i.item_name = k'), _PK + 'pk_bake_adjusts_a_packaging_line_refused / '),
    'text_get_recipes_lines_are_ingredients': ('get_recipes', 'text',
        ("from public.recipe_ingredients i where i.product_id = r.product_id and i.kind = 'ingredient'), '[]'::jsonb),",
         "from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb),"), _PKC + 'pk_get_recipes_separates_the_kinds'),
    'text_get_recipes_history_drops_packaging': ('get_recipes', 'text', ("where not (l.value ? 'kind')", 'where true'),
        _PKC + 'pk_history_lists_ingredients_only'),
    'text_save_recipe_leaves_the_packaging': ('save_recipe', 'text',
        ("where i.product_id = v_product and i.kind = 'ingredient'; -- B3b: the ingredient lines only", 'where i.product_id = v_product; -- B3b: the ingredient lines only'),
        _PKC + 'pk_save_recipe_keeps_packaging'),
    'text_save_recipe_snapshot_has_the_packaging': ('save_recipe', 'text',
        ('values (v_product, v_row.version + 1, v_yield::integer, v_norm || v_pkg);', 'values (v_product, v_row.version + 1, v_yield::integer, v_norm);'),
        _PKC + 'pk_save_recipe_snapshot_carries_packaging'),
    'text_save_recipe_noop_compares_ingredients': ('save_recipe', 'text',
        ("into v_cur from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'ingredient';",
         'into v_cur from public.recipe_ingredients i where i.product_id = v_product;'), _PKC + 'pk_save_recipe_noop_ignores_packaging'),
}
PACKAGING_TABLE_MUTATIONS = {
    'packaging_rules_table_select': ('grant select on public.packaging_rules to anon;', 'packaging outcome differs: anon / rules_select / '),
    'packaging_state_table_select': ('grant select on public.packaging_rules_state to anon;', 'packaging outcome differs: anon / rules_state_select / '),
}
OPERATIONS_MUTATIONS = {
    'rule_ops_service': ('record_operations_run', 'rule', 'run-service', 'operations denial differs: record_anon / 00000'),
    'rule_ops_time': ('record_operations_run', 'rule', 'run-time', 'future run time accepted'),
    'rule_ops_input': ('record_operations_run', 'rule', 'run-input', 'nonbackup archive hash accepted'),
    'rule_ops_idempotency': ('record_operations_run', 'rule', 'run-idempotency', 'idempotency conflict differs: 00000'),
    'rule_ops_health_role': ('get_operations_health', 'rule', 'health-role', 'operations denial differs: health_helper / 00000'),
    'rule_ops_retention_service': ('prune_personal_data', 'rule', 'retention-service', 'operations denial differs: retention_helper / 00000'),
    'rule_ops_retention_window': ('prune_personal_data', 'rule', 'retention-window', 'short retention accepted'),
}


def order_mutant(name):
    """The migration's one function, changed in exactly one place, as SQL to run inside the suite."""
    function, kind, argument, _ = (ORDER_MUTATIONS | LOOKUP_MUTATIONS | STAFF_MUTATIONS | SHOP_MUTATIONS | EXTRAS_MUTATIONS | SCHEDULED_MUTATIONS | STOCK_MUTATIONS | RECIPE_MUTATIONS | LEDGER_MUTATIONS | PRODUCTION_MUTATIONS | BOOKS_MUTATIONS | OPERATIONS_MUTATIONS | IDENTITY_RULES | LINK_MUTATIONS | COST_MUTATIONS | BATCH_CORRECTION_MUTATIONS | PACKAGING_MUTATIONS | CUTOVER_MUTATIONS)[name]
    marker = 'create or replace function public.' + function + '('
    text = [m.read_text(encoding='utf-8') for m in ORDER_MIGRATIONS if marker in m.read_text(encoding='utf-8')][-1]
    start = text.index('create or replace function public.' + function + '(')
    block = text[start:text.index('\n$$;', start) + len('\n$$;')]
    if kind == 'rule':
        pattern = r'(?m)^(\s*)if\s.*\sthen\s*-- rule:' + re.escape(argument) + r'\s*$'
        block, count = re.subn(pattern, r'\1if false then -- mutated', block)
    else:
        old, new = argument
        count = block.count(old)
        block = block.replace(old, new)
    if count != 1:
        h.fail('order mutation ' + name + ' matched ' + str(count) + ' places, not one')
    return block


# B2: shop identity and the business clock. The ACL mutants are the generic grant-to-anon ones; this
# one restores a raw table grant plus a policy, which the helper's table read must catch.
IDENTITY_MUTATIONS = {
    'identity_table_raw_write': ("grant select, insert, update, delete on public.shop_identity to authenticated; create policy \"leak\" on public.shop_identity for all to authenticated using (true) with check (true);",
                                 'forbidden identity call succeeded: active_helper / identity_table_select'),
}
# The tagged refusals of save_shop_identity. `identity-object` carries no tag: a null or non-object
# input would still be refused by the keys rule or by jsonb_object_keys, so no case could tell.
IDENTITY_RULES = {
    'rule_identity_owner': ('save_shop_identity', 'rule', 'identity-owner', 'forbidden identity call succeeded: active_helper / save_shop_identity'),
    'rule_identity_keys': ('save_shop_identity', 'rule', 'identity-keys', 'forbidden identity call succeeded: active_owner / identity_save_unknown_key'),
    'rule_identity_types': ('save_shop_identity', 'rule', 'identity-types', 'forbidden identity call succeeded: active_owner / identity_save_number'),
    'rule_identity_length': ('save_shop_identity', 'rule', 'identity-length', 'identity outcome differs: active_owner / identity_save_shop_name_long / 23514'),
    'rule_identity_control': ('save_shop_identity', 'rule', 'identity-control', 'identity outcome differs: active_owner / identity_save_control_tab / 23514'),
    'rule_identity_stale': ('save_shop_identity', 'rule', 'identity-stale', 'forbidden identity call succeeded: active_owner / identity_save_stale_without_row'),
}
IDENTITY_ROWS = 64
CLOCK_CASES = (ROOT / 'tests/fixtures/clock-cases.json').read_text(encoding='utf-8')
# B3a: every policy calls its helper wrapped. policies.sql compares the database with this list (the policies as they were
# before migration 58, helper calls bare); each mutant restates one policy and the suite must fail with its message.
POLICIES_BEFORE = (ROOT / 'tests/fixtures/policies-before-58.json').read_text(encoding='utf-8')
POLICY_MUTATIONS = {
    'policy_bare_owner': ("alter policy \"orders staff read\" on public.orders using (public.is_owner());",
                          'policy helper call is not wrapped: orders / orders staff read'),
    'policy_bare_uid': ("alter policy \"own profile\" on public.profiles using (id = auth.uid());",
                        'policy helper call is not wrapped: profiles / own profile'),
    'policy_bare_storage': ("alter policy \"shop media owner select\" on storage.objects using (bucket_id = 'shop-media' and public.is_owner());",
                            'policy helper call is not wrapped: objects / shop media owner select'),
    'policy_text_changed': ("alter policy \"orders staff read\" on public.orders using ((select public.is_owner()) or true);",
                            'policy text differs: orders / orders staff read'),
    'policy_added': ("create policy \"leak\" on public.settings for select using (true);",
                     'policy count differs'),
}
SUITES = (
    ('public-catalog.sql', ('catalog_raw_read','catalog_view_update'), 'catalog boundary', 41),
    ('private-role-authority.sql', ('private_orders_select','private_stock_update'), 'private authority', 103),
    ('search-paths.sql', ('lookup_order(text,text)','drop_remaining(uuid)','settings_effective()'), 'search path shadow', 5),
    ('future-object-authority.sql', ('future_table_select','future_sequence_usage'), 'future authority', 24),
    ('auxiliary-authority.sql', ('orders_references','sequence_select','sequence_usage','sequence_update'), 'auxiliary boundary', 46),
    ('trigger-authority.sql', ('orders_trigger', 'touch_updated_at()', 'settings_touch()'), 'trigger boundary', 50),
    ('maintenance.sql', ('consume_rate_limit(text,integer,integer)', 'prune_rate_limits()', 'prune_personal_data(integer)'), 'forbidden maintenance invocation succeeded', 18),
    ('read-rpcs.sql', ('lookup_order(text,text)', 'drop_remaining(uuid)', 'settings_effective()'), 'forbidden read RPC invocation succeeded', 18),
    ('order-inserts.sql', ('orders', 'order_items'), 'forbidden order insert succeeded', 12),
    ('legacy-mutations.sql', ('sync_event_sale(jsonb)', 'update_order_state(text,timestamptz,text,text,text)'), 'legacy EXECUTE boundary missing: active_owner / ', 14),
    ('audit-writes.sql', ('audit_staff_insert',), 'forbidden audit mutation succeeded: active_owner / insert', 30),
    ('table-truncate.sql', ('settings_truncate',), 'forbidden truncate succeeded: anon / settings', 46),
    ('settings.sql', ('settings_staff_read',), 'settings visibility differs: active_helper', 84),
    ('profiles.sql', ('current_role_name_missing_active_filter',), 'profile authority differs: inactive_owner_forged_service', 17),
    ('erasure-authority.sql', ('anonymise_customer(text,text)',), 'erasure ACL boundary missing: anon', 12),
    ('flavours.sql', ('get_flavours()', 'save_flavour(text,jsonb,timestamptz)', 'publish_flavours(text[])'), 'forbidden flavour call succeeded', 52),
    ('bazaar-events.sql', ('start_event(text,text,bigint,uuid)', 'set_event_device(uuid,text)', 'record_event_sale(jsonb)', 'void_event_sale(jsonb)'), 'forbidden bazaar call succeeded', 87),
    ('payment-methods.sql', ('get_payment_methods()', 'save_payment_method(text,jsonb,timestamptz)', 'save_shop_texts(jsonb,timestamptz)',
                             'shop_media_anon_read', 'shop_media_helper_write', 'shop_media_path_unchecked',
                             'payment_tables_raw_write', 'public_read_leaks_inactive'), 'forbidden payment call succeeded', 88),
    ('order-placement.sql', ('get_order_rules()', 'save_order_rules(jsonb,timestamptz)',
                             'orders_rows_leak', 'waitlist_table_select', 'rules_table_select')
                            + tuple(ORDER_MUTATIONS), 'forbidden order call succeeded', 175),
    ('order-lookup.sql', tuple(LOOKUP_MUTATIONS), 'forbidden lookup call succeeded', 24),
    ('staff-orders.sql', STAFF_ACL + tuple(STAFF_MUTATIONS) + tuple(STAFF_TABLE_MUTATIONS), 'forbidden staff order call succeeded', 122),
    ('shop-state.sql', ('set_shop_override(text)',) + tuple(SHOP_MUTATIONS), 'forbidden shop state call succeeded', 29),
    ('order-extras.sql', ('get_order_extras()', 'save_order_extras(jsonb,timestamptz)')
                         + tuple(EXTRAS_MUTATIONS) + tuple(EXTRAS_TABLE_MUTATIONS), 'forbidden extras call succeeded', 143),
    ('scheduled-events.sql', ('get_scheduled_events()', 'save_scheduled_event(jsonb,timestamptz)', 'link_scheduled_event(uuid,uuid)')
                             + tuple(SCHEDULED_MUTATIONS) + tuple(SCHEDULED_TABLE_MUTATIONS), 'forbidden scheduled call succeeded', 69),
    ('stock-catalogue.sql', ('get_stock_catalogue()', 'save_supplier(jsonb,timestamptz)', 'save_stock_item(jsonb,timestamptz)',
                             'save_supplier_price(jsonb,timestamptz)') + tuple(STOCK_MUTATIONS) + tuple(STOCK_TABLE_MUTATIONS),
     'forbidden stock call succeeded', 172),
    ('recipes.sql', ('get_recipes()', 'save_recipe(jsonb,timestamptz)') + tuple(RECIPE_MUTATIONS) + tuple(RECIPE_TABLE_MUTATIONS),
     'forbidden recipe call succeeded', 96),
    ('identity-links.sql', ('preview_identity_links()', 'apply_identity_links(jsonb)') + tuple(LINK_MUTATIONS), 'forbidden link call succeeded', 53),
    ('recipe-drafts.sql', (), 'draft outcome differs', 21),
    ('stock-ledger.sql', ('record_stock_movement(jsonb)', 'get_last_paid()') + tuple(LEDGER_MUTATIONS) + tuple(LEDGER_TABLE_MUTATIONS),
     'forbidden ledger call succeeded', 87),
    ('production.sql', ('record_production(jsonb)', 'record_pack(text,integer)', 'get_production(integer)', 'record_discard(jsonb)')
                       + tuple(PRODUCTION_MUTATIONS) + tuple(PRODUCTION_TABLE_MUTATIONS), 'forbidden production call succeeded', 129),
    ('books.sql', ('get_books(timestamptz,timestamptz)', 'record_expense(jsonb)', 'record_cost_correction(jsonb)', 'set_cost_basis(text)', 'record_draw(jsonb)')
                  + tuple(BOOKS_MUTATIONS) + tuple(BOOKS_TABLE_MUTATIONS), 'forbidden books call succeeded', 112),
    ('item-costs.sql', ('save_item_price(jsonb)', 'get_item_costs()', 'get_recipe_costs()') + tuple(COST_MUTATIONS),
     'forbidden cost call succeeded', 176),
    ('cost-cutover.sql', tuple(CUTOVER_MUTATIONS) + tuple(CUTOVER_TABLE_MUTATIONS), 'forbidden cutover call succeeded', 186),
    ('batch-correction.sql', ('record_batch_correction(jsonb)',) + tuple(BATCH_CORRECTION_MUTATIONS), 'forbidden correction call succeeded', 110),
    ('packaging.sql', ('get_packaging_rules()', 'save_packaging_rules(jsonb,timestamptz)', 'save_recipe_packaging(jsonb,timestamptz)')
                      + tuple(PACKAGING_MUTATIONS) + tuple(PACKAGING_TABLE_MUTATIONS), 'forbidden packaging call succeeded', 168),
    ('operations.sql', tuple(OPERATIONS_MUTATIONS), 'forbidden operations call succeeded', 14),
    ('bazaar-closeout.sql', ('event_summary(uuid)', 'load_event_stock(uuid,jsonb,bigint)', 'add_event_expense(jsonb)', 'close_event(jsonb)'), 'forbidden closeout call succeeded', 80),
    ('shop-identity.sql', ('save_shop_identity(jsonb,timestamptz)', 'business_clock(timestamptz)') + tuple(IDENTITY_MUTATIONS) + tuple(IDENTITY_RULES),
     'forbidden identity call succeeded', IDENTITY_ROWS),
    ('policies.sql', tuple(POLICY_MUTATIONS), 'policy', 42),
)
CATALOG_GUARD_SQL = """
select json_build_object(
  'no_rls', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity), '[]'::json),
  'views', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'), '[]'::json),
  'schema_grants', coalesce((select json_agg(role_name order by role_name) from unnest(array['anon','authenticated','service_role']) as role_name
    where has_schema_privilege(role_name, 'hco_private', 'USAGE,CREATE')), '[]'::json),
  'table_grants', coalesce((select json_agg(x order by x) from (
    select concat(role_name,'/',t.relname,'/',priv) as x from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      cross join unnest(array['anon','authenticated','service_role']) as role_name
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as priv
      where n.nspname = 'hco_private' and t.relkind in ('r','p','v')
        and has_table_privilege(role_name, t.oid, priv)) q), '[]'::json)
)::text;
"""
PAYMENT_MUTATIONS = {
    'shop_media_anon_read': ("create policy \"leak\" on storage.objects for select to anon using (bucket_id = 'shop-media');",
                             'forbidden payment call succeeded: anon / media_list'),
    'shop_media_helper_write': ("create policy \"leak\" on storage.objects for insert to authenticated with check (bucket_id = 'shop-media');",
                                'forbidden payment call succeeded: active_helper / media_insert'),
    'shop_media_path_unchecked': ("alter policy \"shop media owner insert\" on storage.objects with check (bucket_id = 'shop-media' and public.is_owner());",
                                  'forbidden payment call succeeded: active_owner / media_insert_traversal'),
    'payment_tables_raw_write': ("grant select, insert, update, delete on public.payment_methods to authenticated; create policy \"leak\" on public.payment_methods for all to authenticated using (public.is_owner()) with check (public.is_owner());",
                                 'forbidden payment call succeeded: active_helper / methods_table_select'),
    'public_read_leaks_inactive': ("create or replace function public.get_shop_payment_info() returns jsonb language sql stable security definer set search_path = '' as $f$ select jsonb_build_object('methods', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'number', m.account_number, 'name', m.account_name, 'qr', m.qr_path) order by m.sort_order, m.id) from public.payment_methods m), '[]'::jsonb), 'texts', coalesce((select jsonb_build_object('registration_badge', t.registration_badge, 'tin_line', t.tin_line, 'invoice_note', t.invoice_note, 'allergen_note', t.allergen_note, 'updated_at', t.updated_at) from public.shop_texts t), jsonb_build_object('registration_badge', '', 'tin_line', '', 'invoice_note', '', 'allergen_note', '', 'updated_at', null))); $f$;",
                                   'public payment read differs: anon_default'),
}

REPORT = ROOT / "docs/state/evidence/MP-06l-security.json"
EMPTY_FIXTURES = 'select ' + ' and '.join(
    'not exists(select 1 from public.' + table + ')'
    for table in ('orders', 'order_items', 'products', 'drops', 'settings', 'rate_limits', 'profiles', 'audit_log', 'ledger_entries', 'event_sales', 'event_sale_items', 'inventory_items', 'bake_batches', 'recipes', 'recipe_ingredients', 'suppliers', 'supplier_prices', 'events', 'erasure_requests', 'payment_methods', 'shop_texts', 'shop_identity', 'waitlist_entries', 'order_add_ons', 'order_boxes', 'scheduled_events', 'recipe_versions', 'stock_movements', 'item_prices', 'packaging_rules', 'packaging_rules_state', 'books_cutover')) + " and not exists(select 1 from auth.users) and to_regnamespace('mp06f_probe') is null and to_regnamespace('mp06g_probe') is null and to_regclass('public.mp06g_future') is null and to_regclass('public.mp06g_future_id_seq') is null;"


def main():
    if len(sys.argv) != 1:
        h.fail("security fixture accepts no URLs, project refs or arguments")
    report = {"status": "failed", "scope": "Local SQL-role containment and erasure authority/effects; not JWT/API, hosted erasure or full MP-06 acceptance", "runs": [], "regressions_detected": [], "upgrade_runs": 0, "legacy_regression_diagnostics": [], "sequence_restorations": 0, "function_guard_runs": 0, "catalog_guard_runs": 0, "catalog_guard_red_runs": 0}

    def check(db_id, workdir, password, fixture_report):
        def assert_functions():
            query = (ROOT / 'tests/integration/db/schema-inventory.sql').read_text(encoding='utf-8')
            verify_functions(json.loads(h.psql(db_id, workdir, query))['functions'])
            report['function_guard_runs'] += 1
        def assert_catalog_wide():
            result = json.loads(h.psql(db_id, workdir, CATALOG_GUARD_SQL))
            if result['no_rls']:
                h.fail('catalog guard: public relation(s) without row-level security: ' + ','.join(result['no_rls']))
            if result['views'] != ['shop_drops', 'shop_products']:
                h.fail('catalog guard: unexpected public view set: ' + ','.join(result['views']))
            if result['schema_grants'] or result['table_grants']:
                h.fail('catalog guard: an API role has a privilege in hco_private')
            report['catalog_guard_runs'] += 1
        def assert_catalog_wide_red():
            # Deliberately create a public table with RLS left off; the guard must flag it, then roll back.
            probe = 'begin; create table public.mp06p_catalog_guard_probe(id integer);\n' + CATALOG_GUARD_SQL + '\nrollback;'
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if 'mp06p_catalog_guard_probe' not in result['no_rls']:
                h.fail('catalog guard failed to detect a public table without row-level security')
            report['catalog_guard_red_runs'] += 1
            # Deliberately widen hco_private to PUBLIC (not a named API role); the
            # guard must still flag it via has_schema_privilege/has_table_privilege,
            # which fold PUBLIC in, then roll back.
            probe = ('begin; grant usage on schema hco_private to public;'
                      ' grant select on hco_private.bff_sessions to public;\n'
                      + CATALOG_GUARD_SQL + '\nrollback;')
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if not result['schema_grants'] or not any('bff_sessions' in item for item in result['table_grants']):
                h.fail('catalog guard failed to detect a PUBLIC grant into hco_private')
            report['catalog_guard_red_runs'] += 1
        assert_functions()
        assert_catalog_wide_red()
        assert_catalog_wide()
        def assert_empty():
            # Every call opens a fresh connection, independent of the test transaction.
            if h.psql(db_id, workdir, EMPTY_FIXTURES).strip() != 't':
                h.fail('security fixture tables are not empty after rollback or before tests')
        def run_suite(sql, auxiliary=False):
            if not auxiliary:
                return h.psql(db_id, workdir, sql)
            state_sql = "select json_build_object('value',last_value,'called',is_called) from public.audit_log_id_seq;"
            before = json.loads(h.psql(db_id, workdir, state_sql))
            try:
                return h.psql(db_id, workdir, sql)
            finally:
                value, called = before['value'], before['called']
                if type(value) is not int or type(called) is not bool:
                    h.fail('sequence snapshot has invalid shape')
                h.psql(db_id, workdir, f"select setval('public.audit_log_id_seq',{value},{str(called).lower()});")
                if json.loads(h.psql(db_id, workdir, state_sql)) != before:
                    h.fail('owned audit sequence restoration failed')
                report['sequence_restorations'] += 1
        assert_empty()
        upgrade = (ROOT / 'tests/integration/security/profile-upgrade.sql').read_text(encoding='utf-8')
        migration = (ROOT / 'supabase/migrations/20260101001100_active_profile_authority.sql').read_text(encoding='utf-8')
        if h.psql(db_id, workdir, upgrade.replace('__ACTIVE_MIGRATION__', migration)).splitlines().count('UPGRADE|passed') != 1:
            h.fail('populated profile upgrade proof missing')
        assert_empty()
        report['upgrade_runs'] += 1
        results = []
        for filename, signatures, forbidden, expected in SUITES:
            raw_sql = (ROOT / 'tests/integration/security' / filename).read_text(encoding='utf-8')
            sql = raw_sql.replace('__FUTURE_RED_GRANT__', '').replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', '').replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', '').replace('__CLOCK_CASES__', json.dumps(json.loads(CLOCK_CASES)).replace("'", "''")).replace('__POLICIES_BEFORE__', json.dumps(json.loads(POLICIES_BEFORE)).replace("'", "''"))
            for signature in signatures:
                # Failed psql closes the connection and rolls back synthetic grant/data.
                table_test = filename == 'order-inserts.sql'
                grant = 'grant insert on table public.' if table_test else 'grant execute on function public.'
                operation = signature + '_insert' if table_test else signature.split('(')[0]
                broken = sql.replace('begin;', 'begin;\n' + grant + signature + ' to anon;', 1)
                expected_error = forbidden + ': anon / ' + operation
                if filename == 'order-placement.sql':
                    if signature in ORDER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;\n' + order_mutant(signature), 1)
                        expected_error = ORDER_MUTATIONS[signature][3]
                    elif signature in ORDER_TABLE_MUTATIONS:
                        unsafe, expected_error = ORDER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'maintenance.sql' and signature == 'prune_personal_data(integer)':
                    # The in-function service guard refuses the injected grant; the later ACL oracle catches it.
                    expected_error = 'effective maintenance execute still granted'
                if filename == 'order-lookup.sql':
                    broken = sql.replace('begin;', 'begin;\n' + order_mutant(signature), 1)
                    expected_error = LOOKUP_MUTATIONS[signature][3]
                if filename == 'staff-orders.sql':
                    if signature in STAFF_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = STAFF_MUTATIONS[signature][3]
                    elif signature in STAFF_TABLE_MUTATIONS:
                        unsafe, expected_error = STAFF_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'scheduled-events.sql':
                    if signature in SCHEDULED_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = SCHEDULED_MUTATIONS[signature][3]
                    elif signature in SCHEDULED_TABLE_MUTATIONS:
                        unsafe, expected_error = SCHEDULED_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'stock-catalogue.sql':
                    if signature in STOCK_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = STOCK_MUTATIONS[signature][3]
                    elif signature in STOCK_TABLE_MUTATIONS:
                        unsafe, expected_error = STOCK_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'recipes.sql':
                    if signature in RECIPE_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = RECIPE_MUTATIONS[signature][3]
                    elif signature in RECIPE_TABLE_MUTATIONS:
                        unsafe, expected_error = RECIPE_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'stock-ledger.sql':
                    if signature in LEDGER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = LEDGER_MUTATIONS[signature][3]
                    elif signature in LEDGER_TABLE_MUTATIONS:
                        unsafe, expected_error = LEDGER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'production.sql':
                    if signature in PRODUCTION_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = PRODUCTION_MUTATIONS[signature][3]
                    elif signature in PRODUCTION_TABLE_MUTATIONS:
                        unsafe, expected_error = PRODUCTION_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'books.sql':
                    if signature in BOOKS_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = BOOKS_MUTATIONS[signature][3]
                    elif signature in BOOKS_TABLE_MUTATIONS:
                        unsafe, expected_error = BOOKS_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'cost-cutover.sql':
                    if signature in CUTOVER_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = CUTOVER_MUTATIONS[signature][3]
                    elif signature in CUTOVER_TABLE_MUTATIONS:
                        unsafe, expected_error = CUTOVER_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'batch-correction.sql' and signature in BATCH_CORRECTION_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = BATCH_CORRECTION_MUTATIONS[signature][3]
                if filename == 'packaging.sql':
                    if signature in PACKAGING_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = PACKAGING_MUTATIONS[signature][3]
                    elif signature in PACKAGING_TABLE_MUTATIONS:
                        unsafe, expected_error = PACKAGING_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'item-costs.sql' and signature in COST_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = COST_MUTATIONS[signature][3]
                if filename == 'identity-links.sql' and signature in LINK_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = LINK_MUTATIONS[signature][3]
                if filename == 'operations.sql':
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = OPERATIONS_MUTATIONS[signature][3]
                if filename == 'order-extras.sql':
                    if signature in EXTRAS_MUTATIONS:
                        broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                        expected_error = EXTRAS_MUTATIONS[signature][3]
                    elif signature in EXTRAS_TABLE_MUTATIONS:
                        unsafe, expected_error = EXTRAS_TABLE_MUTATIONS[signature]
                        broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'shop-state.sql' and signature in SHOP_MUTATIONS:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = SHOP_MUTATIONS[signature][3]
                if filename == 'payment-methods.sql' and signature in PAYMENT_MUTATIONS:
                    unsafe, expected_error = PAYMENT_MUTATIONS[signature]
                    broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'shop-identity.sql' and signature in IDENTITY_MUTATIONS:
                    unsafe, expected_error = IDENTITY_MUTATIONS[signature]
                    broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'shop-identity.sql' and signature in IDENTITY_RULES:
                    broken = sql.replace('begin;', 'begin;' + chr(10) + order_mutant(signature), 1)
                    expected_error = IDENTITY_RULES[signature][3]
                if filename == 'policies.sql':
                    unsafe, expected_error = POLICY_MUTATIONS[signature]
                    broken = sql.replace('begin;', 'begin;' + chr(10) + unsafe, 1)
                if filename == 'profiles.sql':
                    # Restore only the missing active filter, within the failing transaction.
                    unsafe = "create or replace function public.current_role_name() returns public.app_role language sql stable security definer set search_path='' as $$ select p.role from public.profiles p where p.id=auth.uid() $$;"
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'settings.sql':
                    unsafe = 'create policy "settings staff read" on public.settings for select using (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'table-truncate.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant truncate on public.settings to anon;', 1)
                    expected_error = forbidden
                if filename == 'audit-writes.sql':
                    unsafe = 'grant insert on public.audit_log to authenticated; create policy "audit staff insert" on public.audit_log for insert with check (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'legacy-mutations.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant execute on function public.' + signature + ' to authenticated;', 1)
                    expected_error = forbidden + signature.split('(')[0]
                if filename == 'trigger-authority.sql':
                    if signature == 'orders_trigger':
                        unsafe = 'grant trigger on public.orders to anon;'
                        expected_error = 'trigger table boundary missing: anon / orders'
                    else:
                        unsafe = 'grant execute on function public.' + signature + ' to anon;'
                        expected_error = 'trigger function boundary missing: anon / ' + signature.split('(')[0]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'auxiliary-authority.sql':
                    if signature == 'orders_references':
                        unsafe = 'grant references on public.orders to anon;'
                        expected_error = 'references boundary missing: anon / orders'
                    else:
                        privilege = signature.split('_')[1]
                        unsafe = 'grant ' + privilege + ' on sequence public.audit_log_id_seq to anon;'
                        expected_error = 'sequence boundary missing: anon / ' + {'select':'read','usage':'nextval','update':'setval'}[privilege]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'future-object-authority.sql':
                    if signature == 'future_table_select':
                        unsafe = 'grant select on public.mp06g_future to anon;'
                        expected_error = 'forbidden future table operation succeeded: anon / select'
                    else:
                        unsafe = 'grant usage on sequence public.mp06g_future_id_seq to anon;'
                        expected_error = 'forbidden future sequence operation succeeded: anon / nextval'
                    broken = raw_sql.replace('__FUTURE_RED_GRANT__', unsafe)
                if filename == 'private-role-authority.sql':
                    if signature == 'private_orders_select':
                        unsafe = 'alter policy "orders staff read" on public.orders using (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', unsafe).replace('__PRIVATE_RED_UPDATE_POLICY__', '')
                        expected_error = 'private read differs: active_helper / orders / 1'
                    else:
                        unsafe = 'alter policy "stock staff read" on public.inventory_items using (public.is_staff()); alter policy "stock staff write" on public.inventory_items using (public.is_staff()) with check (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', 'reset role; ' + unsafe + ' set local role authenticated;')
                        # A3 revoked UPDATE on inventory_items from the API roles (writes go through save_stock_item), as B3 did
                        # for orders: the widened policy is now caught by the read check, and the write by stock-catalogue.sql.
                        expected_error = 'private read differs: active_support / inventory_items / 1'
                if filename == 'public-catalog.sql':
                    if signature == 'catalog_raw_read':
                        unsafe = 'alter policy "catalogue public read" on public.products using (active or public.is_staff());'
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', unsafe).replace('__CATALOG_RED_VIEW_GRANT__', '')
                        expected_error = 'raw visibility differs: anon'
                    else:
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', 'grant update on public.shop_products to anon;')
                        expected_error = 'view mutation succeeded: anon / shop_products / update'
                if filename == 'search-paths.sql':
                    unsafe = 'alter function public.' + signature + ' set search_path=public;'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = 'search path shadow: ' + signature.split('(')[0]
                if filename == 'erasure-authority.sql':
                    expected_error = forbidden
                try:
                    run_suite(broken, filename == 'auxiliary-authority.sql')
                except RuntimeError as error:
                    if expected_error not in str(error):
                        raise
                    report['regressions_detected'].append(signature)
                    if filename == 'legacy-mutations.sql':
                        report['legacy_regression_diagnostics'].append(str(error))
                else:
                    h.fail('role suite failed to detect a deliberately restored unsafe grant: ' + filename + ' / ' + signature)
                assert_empty()
            output = run_suite(sql, filename == 'auxiliary-authority.sql')
            rows = [line for line in output.splitlines() if line.startswith('SEC_RESULT|')]
            if len(rows) != expected or len(set(rows)) != expected:
                h.fail(filename + ' did not return its complete role matrix')
            results.extend(rows)
            assert_empty()
        if len(set(results)) != 2819:
            h.fail('combined role matrix has missing or duplicate cases: %d rows, %d unique (duplicates: %s)' % (len(results), len(set(results)), sorted({r for r in results if results.count(r) > 1})[:5]))
        assert_functions()
        assert_catalog_wide()
        h.catalog(db_id, workdir, h.sql_for(h.expected_versions()))
        report["runs"].append(sorted(results))

    h.REPORT = ROOT / "docs/state/evidence/MP-06l-bootstrap.json"
    # Replace an older pass before bootstrap preflight can fail.
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    try:
        code = h.main(after_reset=check)
        if (code == 0 and len(report["runs"]) == 2 and report["runs"][0] == report["runs"][1]
                and len(report['regressions_detected']) == 1068 and report['sequence_restorations'] == 10
                and report['upgrade_runs'] == 2 and report['function_guard_runs'] == 4
                and report['catalog_guard_runs'] == 4 and report['catalog_guard_red_runs'] == 4):
            report.update(status="passed", cases_per_reset=2819, resets=2, matrix_equal=True, rollback_verified=True,
                          sql_sha256={name: hashlib.sha256((ROOT / 'tests/integration/security' / name).read_bytes()).hexdigest() for name, _, _, _ in SUITES},
                          harness_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    except (RuntimeError, OSError, ValueError) as error:
        report['error'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    finally:
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("status", "cases_per_reset", "resets")}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
