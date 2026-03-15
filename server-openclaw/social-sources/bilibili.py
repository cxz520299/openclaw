import os
from typing import Any, Dict

from bilibili_api import ass, search, sync, video
from bilibili_api.search import OrderUser, SearchObjectType
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Bilibili mcp server")


@mcp.tool()
def general_search(keyword: str) -> dict[Any, Any]:
    return sync(search.search(keyword))


@mcp.tool()
def search_user(keyword: str, page: int = 1) -> dict[Any, Any]:
    return sync(
        search.search_by_type(
            keyword=keyword,
            search_type=SearchObjectType.USER,
            order_type=OrderUser.FANS,
            page=page,
        )
    )


@mcp.tool()
def get_precise_results(keyword: str, search_type: str = "user") -> Dict[str, Any]:
    type_map = {
        "user": SearchObjectType.USER,
        "video": SearchObjectType.VIDEO,
        "live": SearchObjectType.LIVE,
        "article": SearchObjectType.ARTICLE,
    }

    search_obj_type = type_map.get(search_type.lower(), SearchObjectType.USER)
    result = sync(
        search.search_by_type(
            keyword=keyword,
            search_type=search_obj_type,
            page=1,
            page_size=50,
        )
    )

    if search_type.lower() == "user" and "result" in result:
        filtered_result = []
        exact_match_result = []

        for user in result.get("result", []):
            filtered_user = {
                "uname": user.get("uname", ""),
                "mid": user.get("mid", 0),
                "face": user.get("upic", ""),
                "fans": user.get("fans", 0),
                "videos": user.get("videos", 0),
                "level": user.get("level", 0),
                "sign": user.get("usign", ""),
                "official": user.get("official_verify", {}).get("desc", ""),
            }

            if user.get("uname", "").lower() == keyword.lower():
                exact_match_result.append(filtered_user)
            else:
                filtered_result.append(filtered_user)

        if exact_match_result:
            return {"users": exact_match_result, "exact_match": True}

        return {"users": filtered_result, "exact_match": False}

    return result


@mcp.tool()
def get_video_danmaku(bv_id: str):
    v = video.Video(bv_id)
    output_filepath = "protobuf.ass"
    sync(
        ass.make_ass_file_danmakus_protobuf(
            obj=v,
            page=0,
            out=output_filepath,
        )
    )
    with open(output_filepath, "r", encoding="utf-8") as f:
        content = f.read()
    os.remove(output_filepath)
    return content


if __name__ == "__main__":
    mcp.run(transport="stdio")
