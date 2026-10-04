package com.webpro.player.domain.model

data class Category(
    val id: String,
    val name: String,
    val parentId: String? = null
) {
    companion object {
        /** Virtual category that groups every item of a section. */
        const val ALL_ID = "__all__"

        /** Virtual category with the user's local favorites. */
        const val FAVORITES_ID = "__fav__"
    }
}
