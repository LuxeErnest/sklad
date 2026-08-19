//! Типы-обёртки для идентификаторов и количества.
//!
//! Раньше всё это были голые `i64`, и подписи вида
//! `assemble(configuration_id: i64, quantity: i64, location_id: i64)`
//! позволяли переставить аргументы местами: код компилировался и молча
//! списывал не то и не оттуда. Компилятор помочь не мог — для него все три
//! числа одинаковы.
//!
//! Обёртки прозрачны для JSON и для SQLite: во фронтенд и в базу по-прежнему
//! уходит обычное число, поэтому ни схема, ни контракт команд не меняются.
//! Меняется только то, что перепутанный аргумент теперь не компилируется.

use rusqlite::types::{FromSql, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::{Result as SqlResult, ToSql};
use serde::{Deserialize, Serialize};

macro_rules! id_type {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, ts_rs::TS,
        )]
        #[serde(transparent)]
        // Во фронтенд уходит обычное число: обёртка нужна компилятору Rust,
        // а не интерфейсу.
        #[ts(export, export_to = "../../src/lib/generated/", type = "number")]
        pub struct $name(pub i64);

        impl $name {
            /// Исходное число — нужно там, где значение уходит наружу.
            ///
            /// Для части типов пока не вызывается: они попадают в SQL и JSON
            /// напрямую через ToSql и Serialize.
            #[allow(dead_code)]
            pub const fn get(self) -> i64 {
                self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl From<i64> for $name {
            fn from(value: i64) -> Self {
                Self(value)
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> SqlResult<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::from(self.0))
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                i64::column_result(value).map(Self)
            }
        }
    };
}

id_type!(
    /// Позиция номенклатуры.
    ItemId
);
id_type!(
    /// Место хранения — тот самый «контейнер», в котором лежит товар.
    LocationId
);
id_type!(
    /// Рецепт сборки.
    ConfigurationId
);
id_type!(
    /// Операция в журнале.
    OperationId
);

/// Количество штук.
///
/// Отдельный тип нужен не меньше, чем идентификаторы: именно количество чаще
/// всего стояло рядом с ними в подписи и могло с ними перепутаться.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ts_rs::TS)]
#[serde(transparent)]
#[ts(export, export_to = "../../src/lib/generated/", type = "number")]
pub struct Quantity(pub i64);

impl Quantity {
    pub const ZERO: Self = Self(0);

    pub const fn get(self) -> i64 {
        self.0
    }

    pub const fn is_positive(self) -> bool {
        self.0 > 0
    }
}

impl std::fmt::Display for Quantity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<i64> for Quantity {
    fn from(value: i64) -> Self {
        Self(value)
    }
}

impl std::ops::Mul<i64> for Quantity {
    type Output = Quantity;
    fn mul(self, rhs: i64) -> Quantity {
        Quantity(self.0 * rhs)
    }
}

impl std::ops::Sub for Quantity {
    type Output = Quantity;
    fn sub(self, rhs: Quantity) -> Quantity {
        Quantity(self.0 - rhs.0)
    }
}

impl ToSql for Quantity {
    fn to_sql(&self) -> SqlResult<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.0))
    }
}

impl FromSql for Quantity {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        i64::column_result(value).map(Self)
    }
}
