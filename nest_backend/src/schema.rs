// @generated automatically by Diesel CLI.

diesel::table! {
    group_permissions (group_id, permission_id) {
        group_id -> Int4,
        permission_id -> Int4,
        created_at -> Timestamp,
    }
}

diesel::table! {
    groups (id) {
        id -> Int4,
        #[max_length = 100]
        name -> Varchar,
        description -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    permissions (id) {
        id -> Int4,
        #[max_length = 100]
        name -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    teams (id) {
        id -> Int4,
        #[max_length = 100]
        name -> Varchar,
        owner_id -> Int4,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    user_groups (user_id, group_id) {
        user_id -> Int4,
        group_id -> Int4,
        created_at -> Timestamp,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        #[max_length = 50]
        username -> Varchar,
        #[max_length = 255]
        email -> Varchar,
        team_id -> Nullable<Int4>,
        #[max_length = 255]
        password -> Varchar,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(group_permissions -> groups (group_id));
diesel::joinable!(group_permissions -> permissions (permission_id));
diesel::joinable!(user_groups -> groups (group_id));
diesel::joinable!(user_groups -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    group_permissions,
    groups,
    permissions,
    teams,
    user_groups,
    users,
);
